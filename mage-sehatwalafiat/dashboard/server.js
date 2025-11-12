/*
 * server.js (Arsitektur Dasbor Pribadi Sederhana)
 * - Menghapus /dispatch, /link-device, /api/session
 * - /dashboard/:id adalah rute utama
 * - Asumsi: devices.user_id adalah PEMILIK, bukan sesi sementara
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const db = require('./database.js'); // Pastikan ini mengarah ke file pool.promise() MySQL Anda
const cron = require('node-cron');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json()); // Untuk parsing body JSON
app.use(express.static('public')); // Melayani file statis (CSS, JS Klien)
app.set('view engine', 'ejs'); // Mengatur EJS sebagai view engine

// --- KONFIGURASI MQTT ---
const MQTT_BROKER = process.env.MQTT_BROKER_URL;
const DATA_TOPIC = process.env.MQTT_TOPIC_DATA;
const STATUS_TOPIC = process.env.MQTT_TOPIC_STATUS;

console.log(`Mencoba terhubung ke MQTT Broker di ${MQTT_BROKER}...`);
const client = mqtt.connect(MQTT_BROKER);

// --- EVENT MQTT ---
client.on('connect', () => {
  console.log('Terhubung ke MQTT Broker');
  client.subscribe([DATA_TOPIC, STATUS_TOPIC], (err) => {
    if (err) {
      console.error('Gagal subscribe ke topik:', err);
    } else {
      console.log(`Berhasil subscribe ke ${DATA_TOPIC} dan ${STATUS_TOPIC}`);
    }
  });
});

client.on('message', async (topic, payload) => {
  try {
    const message = payload.toString();
    console.log(`[MQTT] Menerima pesan di topik ${topic}: ${message}`);
    
    // 1. Parsing data
    let dataPoints;
    try {
      dataPoints = JSON.parse(message);
    } catch (e) {
      console.error(`[MQTT FAIL] Pesan JSON tidak valid: ${message}`);
      return;
    }

    if (!Array.isArray(dataPoints)) {
      dataPoints = [dataPoints];
    }

    // --- PROSES SETIAP DATA POINT ---
    for (const point of dataPoints) {
      // 2. Validasi Token & Temukan Perangkat
      const device = await findDeviceByToken(point.auth_token);
      if (!device) {
        console.warn(`[MQTT FAIL] Invalid token: ${point.auth_token}`);
        continue;
      }
      
      // [LOGIKA PENTING] Dapatkan user_id PERMANEN dari perangkat
      const currentUserId = device.user_id;
      const deviceRoom = `device_${device.id}`;
      
      if (topic === DATA_TOPIC) {
        // (Filter data 0/NULL jika perlu)
        if (!point.heart_rate || !point.spo2 || point.heart_rate === 0 || point.spo2 === 0) {
          io.to(deviceRoom).emit('invalid-data-toast', { message: 'Menerima data tidak valid (HR/SpO2 0)' });
          continue;
        }
        
        // 3. Simpan ke DB
        const newLog = await saveToDatabase(
          device.id, 
          currentUserId, // user_id permanen
          point.heart_rate, 
          point.spo2, 
          point.status, 
          point.hrv, 
          point.sqi, 
          point.timestamp
        );

        // 4. Siarkan data real-time ke dasbor
        if (newLog) {
          io.to(deviceRoom).emit('update-data', newLog);
        }
        
      } else if (topic === STATUS_TOPIC) {
        // 4. Siarkan status perangkat (online/offline)
        await updateDeviceStatus(device.id, point.status);
        io.to(deviceRoom).emit('update-status', {
          deviceId: device.id,
          status: point.status,
          timestamp: new Date()
        });
      }
    }
  } catch (err) {
    console.error('[MQTT ERROR] Gagal memproses pesan:', err.message);
  }
});

client.on('error', (err) => {
  console.error('Koneksi MQTT Error:', err);
});

client.on('offline', () => {
  console.log('MQTT client offline');
});

client.on('reconnect', () => {
  console.log('MQTT client sedang reconnect...');
});


// --- RUTE HTTP ---

// Rute Utama: Menampilkan daftar perangkat
app.get('/', async (req, res) => {
  try {
    const [devices] = await db.query("SELECT * FROM devices ORDER BY device_name");
    res.render('device-list', { devices: devices });
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// Rute Utama Dashboard
// Ini adalah rute tunggal untuk menampilkan dasbor
app.get('/dashboard/:id', async (req, res) => {
  const deviceId = req.params.id;
  
  try {
    // 1. Ambil data perangkat
    const [deviceRows] = await db.query("SELECT * FROM devices WHERE id = ?", [deviceId]);
    if (deviceRows.length === 0) {
      return res.status(404).send('Perangkat tidak ditemukan');
    }
    const device = deviceRows[0];

    // 2. Ambil data PENGGUNA YANG DITAUTKAN (PERMANEN)
    if (!device.user_id) {
      // Jika tidak ada user tertaut, tampilkan error
      return res.status(404).send('Perangkat ini belum ditautkan ke pengguna. Silakan tautkan melalui database.');
    }
    
    const [userRows] = await db.query("SELECT * FROM users WHERE id = ?", [device.user_id]);
    if (userRows.length === 0) {
      return res.status(404).send('Data pengguna tidak ditemukan');
    }
    const user = userRows[0];

    // 3. Ambil data pendukung
    const [logs] = await db.query(
      "SELECT * FROM sensor_logs WHERE device_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT 100", 
      [deviceId, user.id]
    );
    const [allConditions] = await db.query("SELECT * FROM conditions");
    const [userCondRows] = await db.query("SELECT condition_id FROM user_conditions WHERE user_id = ?", [user.id]);
    const userConditions = userCondRows.map(row => row.condition_id);
    
    const isProfileIncomplete = !user.date_of_birth || !user.height || !user.weight;

    // 4. Render dashboard dengan SEMUA data
    res.render('dashboard', {
      device: device,
      user: user, // <-- Variabel 'user' dijamin ada
      logs: logs.reverse(), // Balik agar urut dari lama ke baru
      allConditions: allConditions,
      userConditions: userConditions,
      isProfileIncomplete: isProfileIncomplete
    });
    
  } catch (error) {
    console.error("Error di /dashboard/:id:", error.message);
    res.status(500).send('Server error');
  }
});

// --- RUTE API UNTUK DATA & PROFIL ---

// API: Mengambil log terbaru
app.get('/api/logs/latest/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const { userId } = req.query; // Ambil userId dari query
  if (!userId) {
    return res.status(400).json({ error: 'userId diperlukan' });
  }

  try {
    const [logs] = await db.query(
      "SELECT * FROM sensor_logs WHERE device_id = ? AND user_id = ? ORDER BY timestamp DESC LIMIT 100",
      [deviceId, userId]
    );
    res.json(logs.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil log terbaru' });
  }
});

// API: Mengambil log dengan rentang waktu
app.get('/api/logs/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  const { start, end, userId } = req.query; // Ambil userId dari query
  
  if (!start || !end || !userId) {
    return res.status(400).json({ error: 'Parameter start, end, dan userId diperlukan' });
  }

  try {
    const [logs] = await db.query(
      "SELECT * FROM sensor_logs WHERE device_id = ? AND user_id = ? AND timestamp BETWEEN ? AND ? ORDER BY timestamp ASC",
      [deviceId, userId, start, end]
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil log filter' });
  }
});

// API: Memperbarui profil pengguna
app.put('/api/users/:id', async (req, res) => {
  const userId = req.params.id;
  const { full_name, date_of_birth, sex, height, weight, blood_type, conditions } = req.body;

  if (!full_name || !date_of_birth || !sex) {
    return res.status(400).json({ error: 'Nama, Tanggal Lahir, dan Jenis Kelamin diperlukan' });
  }
  
  const connection = await db.getConnection(); // Dapatkan koneksi untuk transaksi
  try {
    await connection.beginTransaction();

    // 1. Update tabel 'users'
    await connection.query(
      "UPDATE users SET full_name = ?, date_of_birth = ?, sex = ?, height = ?, weight = ?, blood_type = ? WHERE id = ?",
      [full_name, date_of_birth, sex, height, weight, blood_type, userId]
    );
    
    // 2. Update tabel 'user_conditions' (Hapus lalu masukkan ulang)
    await connection.query("DELETE FROM user_conditions WHERE user_id = ?", [userId]);
    
    if (conditions && conditions.length > 0) {
      const conditionValues = conditions.map(condId => [userId, condId]);
      await connection.query("INSERT INTO user_conditions (user_id, condition_id) VALUES ?", [conditionValues]);
    }
    
    // 3. Commit transaksi
    await connection.commit();
    
    // 4. Ambil data pengguna yang sudah diupdate
    const [userRows] = await connection.query("SELECT * FROM users WHERE id = ?", [userId]);
    
    res.json(userRows[0]);

  } catch (error) {
    await connection.rollback(); // Batalkan jika ada error
    console.error('Gagal update profil:', error.message);
    res.status(500).json({ error: 'Gagal memperbarui profil di database' });
  } finally {
    connection.release(); // Selalu lepaskan koneksi
  }
});


// --- LOGIKA SOCKET.IO ---
io.on('connection', (socket) => {
  console.log('[Socket.IO] Klien terhubung');
  
  socket.on('join-room', (deviceId) => {
    // Dapatkan ID device dari URL, bukan string
    const roomName = `device_${deviceId}`;
    socket.join(roomName);
    console.log(`[Socket.IO] Klien bergabung ke room: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log('[Socket.IO] Klien terputus');
  });
});

// --- FUNGSI HELPER DATABASE ---

/**
* Menyimpan log sensor ke database.
*/
async function saveToDatabase(deviceId, userId, hr, sp, stat, hrv, sqi, ts) {
  const query = `
    INSERT INTO sensor_logs 
    (device_id, user_id, heart_rate, spo2, status, hrv, sqi, timestamp) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  // Format timestamp (jika ada) atau gunakan waktu sekarang
  const finalTimestamp = ts ? dayjs(ts).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss") : dayjs().tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss");
  
  const values = [
    deviceId, 
    userId || null, 
    hr || null, 
    sp || null, 
    stat || null, 
    hrv || null, 
    sqi || null, 
    finalTimestamp
  ];
  
  try {
    const [result] = await db.query(query, values);
    // Kembalikan objek log baru untuk disiarkan
    return { 
      id: result.insertId, 
      device_id: deviceId, 
      user_id: userId, 
      heart_rate: hr, 
      spo2: sp, 
      status: stat, 
      hrv: hrv, 
      sqi: sqi, 
      timestamp: finalTimestamp 
    };
  } catch (err) {
    console.error('DB Insert Error:', err.message);
    throw err; 
  }
}

/**
* Mencari perangkat di DB berdasarkan token.
*/
async function findDeviceByToken(token) {
  if (!token) {
    return null;
  }
  try {
    const query = "SELECT * FROM devices WHERE auth_token = ?";
    const [rows] = await db.query(query, [token]);
    return rows[0] || null;
  } catch (error) {
    console.error("Error finding device:", error.message);
    return null;
  }
}

/**
* Memperbarui status perangkat (online/offline) di DB.
*/
async function updateDeviceStatus(deviceId, status) {
  try {
    const query = "UPDATE devices SET status = ?, last_seen = NOW() WHERE id = ?";
    await db.query(query, [status, deviceId]);
  } catch (error) {
    console.error("Error updating device status:", error.message);
  }
}


// --- START SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});
