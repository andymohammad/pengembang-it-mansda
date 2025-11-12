require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const crypto = require('crypto');
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

// Koneksi server ke broker (TANPA LWT)
// LWT adalah tanggung jawab perangkat ESP32
console.log(`Mencoba terhubung ke MQTT Broker di ${MQTT_BROKER}...`);
const client = mqtt.connect(MQTT_BROKER);

// --- EVENT HANDLER MQTT ---

client.on('connect', () => {
  console.log('Connected to MQTT Broker.');
  // Subskripsi ke topik umum
  client.subscribe([DATA_TOPIC, STATUS_TOPIC], (err) => {
    if (!err) {
      console.log(`Subscribed to topics: ${DATA_TOPIC} & ${STATUS_TOPIC}`);
    } else {
      console.error('MQTT Subscribe error:', err);
    }
  });
});

client.on('error', (err) => {
  console.error('MQTT Connection Error:', err);
});

// Menerima SEMUA pesan dari topik yang di-subscribe
client.on('message', async (topic, payload) => {
  const message = payload.toString();
  console.log(`Received message from topic ${topic}: ${message}`);
  
  let data;
  try {
    data = JSON.parse(message);
  } catch (error) {
    console.error('Failed to parse MQTT message (not JSON)', error);
    return;
  }
  let dataPoints = [];
  
  if (Array.isArray(data)) {
    // 1. Ini adalah BATCH (Array)
    dataPoints = data;
    console.log(`[MQTT INFO] Received a batch of ${dataPoints.length} data points.`);
  } else if (typeof data === 'object' && data !== null) {
    // 2. Ini adalah data OBJEK TUNGGAL
    dataPoints = [data]; // Kita bungkus dalam array agar bisa di-loop
  } else {
    // 3. Format tidak dikenal
    console.error('[MQTT FAILED] Payload is not a valid JSON Object or Array.');
    return;
  }
  
  // --- PROSES SETIAP DATA POINT DI DALAM LOOP ---
  
  for (const point of dataPoints) {
    // Ekstrak semua parameter yang kita harapkan
    const { auth_token, heart_rate, spo2, hrv, sqi, timestamp } = point;
    // Tangani "STATUS" (huruf besar) atau "status" (huruf kecil)
    const status = point.STATUS || point.status; 
    
    // Validasi token
    const device = await findDeviceByToken(auth_token);
    
    if (!device) {
      console.warn(`[MQTT FAILED] Invalid token in data point: ${auth_token}`);
      continue; // Lanjutkan ke data point berikutnya dalam batch
    }
    const currentUserId = device.user_id;
    const deviceRoom = `device_${device.id}`;
    // Perangkat valid, lanjutkan
    if (topic === DATA_TOPIC) {
      console.log(`[MQTT SUCCESS] Processing data for device: '${device.device_name}'`);
      if (heart_rate == null || heart_rate === 0 || spo2 == null || spo2 === 0) {
        
        console.log(`[MQTT INFO] Invalid data (HR/SpO2=0) for device: '${device.device_name}'. Not saving.`);
        io.to(deviceRoom).emit('invalid-data-toast', {
          device_name: device.device_name,
          status_message: status || "Data tidak valid (HR/SpO2 = 0)"
        });
        // Lewati sisa loop, jangan simpan ke DB
        continue;
      }
      try {
        // Simpan data point ini ke DB
        await saveToDatabase(device.id,currentUserId, heart_rate, spo2, status, hrv, sqi, timestamp);
        console.log(`[DB SUCCESS] Log data saved for device: ${device.device_name}`);
      } catch (dbError) {
        console.error(`[DB FAILED] Failed to save log for device: ${device.device_name}`, dbError.message);
        continue; 
      }
      
      if (currentUserId) {
        io.to(deviceRoom).emit('update-data', {
          device_id: device.id,
          user_id: currentUserId,
          device_name: device.device_name,
          heart_rate,
          spo2,
          status,
          hrv,
          sqi
        });
      }
    } else if (topic === STATUS_TOPIC) {
      // Proses pembaruan status
      console.log(`[MQTT SUCCESS] Processing status for device: '${device.device_name}'`);
      await updateDeviceStatus(device.id, status);
      io.to(deviceRoom).emit('update-status', {
        device_id: device.id,
        device_name: device.device_name,
        status: status
      });
    }
  } // --- Akhir dari loop 'for' ---
});


// --- HTTP ROUTE ---


app.get('/', async (req, res) => {
  try {
    // Ambil semua perangkat dari DB
    const [devices] = await db.query("SELECT id, device_name, status, last_seen FROM devices ORDER BY device_name");
    // Render halaman 'device-list.ejs' yang baru
    res.render('device-list', { devices: devices }); 
  } catch (err) {
    console.error("Gagal memuat daftar perangkat:", err.message);
    res.status(500).send("Gagal memuat daftar perangkat");
  }
});
// app.get('/dashboard', async (req, res) => {
//   // 1. Ambil device_id dari query URL
//   const { device_id } = req.query;
  
//   // 2. Jika tidak ada ID, paksa kembali ke halaman pemilihan
//   if (!device_id) {
//     return res.redirect('/');
//   }
  
//   let logs = [];
//   let device = null;
//   let user = null;
//   let allConditions = [];
//   let userConditions = [];
//   let isProfileIncomplete = true; 
  
//   try {
//     const [deviceRows] = await db.query("SELECT * FROM devices WHERE id = ?", [device_id]);
//     if (deviceRows.length === 0) {
//       return res.redirect('/'); // Perangkat tidak ditemukan
//     }
//     device = deviceRows[0];
//     [allConditions] = await db.query("SELECT * FROM conditions ORDER BY condition_name");
//     if (device.user_id) {
//       // 4. Ambil profil pengguna
//       const [userRows] = await db.query("SELECT * FROM users WHERE id = ?", [device.user_id]);
//       if (userRows.length > 0) {
//         user = userRows[0];
        
//         // 5. Cek kelengkapan profil
//         // (Kita anggap profil lengkap jika Tgl Lahir DAN Tinggi/Berat diisi)
//         if (user.date_of_birth && user.height_cm && user.weight_kg) {
//           isProfileIncomplete = false;
//         }
        
//         // 6. Ambil kondisi yang sudah dimiliki pengguna
//         const [userCondRows] = await db.query("SELECT condition_id FROM user_conditions WHERE user_id = ?", [user.id]);
//         userConditions = userCondRows.map(row => row.condition_id);
//       }
//     }
//     // Ambil log HANYA untuk perangkat ini
//     const logQuery = `
//       SELECT s.id, s.device_id, s.heart_rate, s.spo2, s.status, s.hrv, s.sqi, s.timestamp, d.device_name 
//       FROM sensor_logs s
//       LEFT JOIN devices d ON s.device_id = d.id
//       WHERE s.device_id = ? 
//       ORDER BY s.timestamp DESC 
//       LIMIT 100
//     `;
//     const [logRows] = await db.query(logQuery, [device_id]);
//     logs = logRows.reverse();
    
//   } catch (err) {
//     console.error("Database query error in GET /dashboard:", err.message);
//     // Tetap render halaman meski log gagal, tapi kirim log kosong
//   }
//   console.log(logs);
//   // 5. Render halaman dashboard, sekarang dengan data 'device' dan 'logs'
//   res.render('dashboard', { logs: logs, device: device,
//     user: user, 
//     allConditions: allConditions, 
//     userConditions: userConditions, 
//     isProfileIncomplete: isProfileIncomplete
//   });
// });

app.get('/dashboard/:id', async (req, res) => {
  const deviceId = req.params.id;
  
  try {
    // 1. Ambil data perangkat
    const [deviceRows] = await db.query("SELECT * FROM devices WHERE id = ?", [deviceId]);
    if (deviceRows.length === 0) {
      return res.status(404).send('Perangkat tidak ditemukan');
    }
    const device = deviceRows[0];

    // [CEK PENTING]
    // Jika tidak ada user_id (misal: user akses URL langsung), paksa kembali!
    if (!device.user_id) {
      return res.redirect(`/link-device/${deviceId}`);
    }
    
    // 2. Ambil data PENGGUNA YANG DITAUTKAN (PASTI ADA)
    const [userRows] = await db.query("SELECT * FROM users WHERE id = ?", [device.user_id]);
    if (userRows.length === 0) {
      // Kasus aneh: user_id ada tapi user tidak ada. Hapus link & redirect.
      await db.query("UPDATE devices SET user_id = NULL WHERE id = ?", [deviceId]);
      return res.redirect(`/link-device/${deviceId}`);
    }
    const user = userRows[0];

    // 3. Ambil data pendukung (logs, conditions, dll.)
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
      user: user, // <-- Variabel 'user' sekarang dijamin ada
      logs: logs.reverse(),
      allConditions: allConditions,
      userConditions: userConditions,
      isProfileIncomplete: isProfileIncomplete
    });
    
  } catch (error) {
    console.error("Error di /dashboard/:id:", error.message);
    res.status(500).send('Server error');
  }
});

app.get('/device/dispatch/:id', async (req, res) => {
  try {
    const deviceId = req.params.id;
    const [deviceRows] = await db.query("SELECT * FROM devices WHERE id = ?", [deviceId]);
    if (deviceRows.length === 0) {
      return res.status(404).send('Perangkat tidak ditemukan');
    }
    
    const device = deviceRows[0];
    
    // Alur 1: Cek penautan
    if (device.user_id) {
      // Alur 3: SUDAH DITAUTKAN. Arahkan ke dashboard.
      res.redirect(`/dashboard/${deviceId}`);
    } else {
      // Alur 2: BELUM DITAUTKAN. Arahkan ke halaman penautan baru.
      res.redirect(`/link-device/${deviceId}`);
    }
  } catch (error) {
    console.error("Error di dispatcher:", error.message);
    res.status(500).send('Server error');
  }
});


app.get('/link-device/:id', async (req, res) => {
  try {
    const deviceId = req.params.id;
    const [deviceRows] = await db.query("SELECT * FROM devices WHERE id = ?", [deviceId]);
    if (deviceRows.length === 0) {
      return res.status(404).send('Perangkat tidak ditemukan');
    }
    
    // Ambil semua pengguna untuk ditampilkan di daftar
    const [allUsers] = await db.query("SELECT id, full_name, date_of_birth FROM users");
    
    // Render file EJS baru (Anda harus membuatnya)
    res.render('link-device', { 
      device: deviceRows[0],
      allUsers: allUsers 
    });
    
  } catch (error) {
    console.error("Error di /link-device:", error.message);
    res.status(500).send('Server error');
  }
});

app.post('/api/profile', async (req, res) => {
  // Ambil data dari body
  const { 
    userId, full_name, date_of_birth, biological_sex, 
    height_cm, weight_kg, blood_type, 
    conditions // Ini diharapkan berupa array [1, 5, 8]
  } = req.body;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID tidak ditemukan.' });
  }
  
  // Gunakan Transaksi Database untuk memastikan semua data tersimpan
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    // 1. Update tabel 'users' (Data Biometrik & Baseline Sederhana)
    await connection.query(
      `UPDATE users SET 
         full_name = ?, date_of_birth = ?, biological_sex = ?, 
         height_cm = ?, weight_kg = ?, blood_type = ?
       WHERE id = ?`,
      [full_name, date_of_birth, biological_sex, height_cm, weight_kg, blood_type || null, userId]
    );
    
    // 2. Hapus semua kondisi lama pengguna
    await connection.query("DELETE FROM user_conditions WHERE user_id = ?", [userId]);
    
    // 3. Masukkan kembali kondisi yang baru (jika ada)
    if (conditions && conditions.length > 0) {
      // Siapkan data untuk 'bulk insert' -> [[userId, condId], [userId, condId]]
      const values = conditions.map(conditionId => [userId, conditionId]);
      await connection.query(
        "INSERT INTO user_conditions (user_id, condition_id) VALUES ?", 
        [values]
      );
    }
    
    // 4. Jika semua berhasil, commit transaksi
    await connection.commit();
    res.json({ message: 'Profil berhasil diperbarui!' });
    
  } catch (error) {
    // 5. Jika ada 1 kegagalan, batalkan semua
    await connection.rollback();
    console.error("Gagal menyimpan profil:", error.message);
    res.status(500).json({ error: 'Gagal menyimpan profil ke database.' });
  } finally {
    // 6. Selalu lepaskan koneksi
    connection.release();
  }
});


app.post('/api/devices', async (req, res) => {
  const { device_name } = req.body;
  if (!device_name) {
    return res.status(400).json({ error: 'device_name is required' });
  }
  
  // Buat token unik
  const token = crypto.randomBytes(24).toString('hex');
  
  try {
    const query = "INSERT INTO devices (device_name, auth_token) VALUES (?, ?)";
    const [result] = await db.query(query, [device_name, token]);
    
    res.status(201).json({
      id: result.insertId,
      device_name: device_name,
      auth_token: token // Berikan token ini ke tim ESP32
    });
  } catch (error) {
    console.error("Error creating device:", error.message);
    res.status(500).json({ error: 'Failed to create device' });
  }
});


app.get('/api/devices', async (req, res) => {
  try {
    const [devices] = await db.query("SELECT id, device_name, status, last_seen FROM devices");
    res.json(devices);
  } catch (error) {
    console.error("Error fetching devices:", error.message);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
});

app.get('/api/logs', async (req, res) => {
  // 1. Ambil query parameter 'start' dan 'end' dari URL
  const { start, end, device_id } = req.query;
  
  // 2. Validasi input
  if (!start || !end || !device_id) {
    return res.status(400).json({ error: 'Parameter "start", "end", dan "device_id" diperlukan' });
  }
  
  try {
    // 3. Buat query SQL dinamis untuk mengambil data di antara dua waktu
    const query = `
      SELECT s.id, s.device_id, s.heart_rate, s.spo2, s.status, s.hrv, s.sqi, s.timestamp, d.device_name 
      FROM sensor_logs s
      LEFT JOIN devices d ON s.device_id = d.id
      WHERE s.timestamp BETWEEN ? AND ? AND s.device_id = ?
      ORDER BY s.timestamp ASC 
    `;
    
    const [rows] = await db.query(query, [start, end, device_id]);
    res.json(rows);
    
  } catch (err) {
    console.error("Database query error in GET /api/logs:", err.message);
    res.status(500).json({ error: 'Gagal mengambil data log' });
  }
});

app.get('/api/generate-dummy', async (req, res) => {
  console.log("Menerima permintaan generate dummy data...");
  try {
    // Ambil perangkat pertama dari DB untuk dijadikan 'pemilik' data dummy
    const [devices] = await db.query("SELECT id, device_name FROM devices LIMIT 1");
    if (devices.length === 0) {
      return res.status(500).json({ error: 'Tidak ada perangkat di DB untuk membuat dummy data. Silakan POST ke /api/devices dulu.' });
    }
    const dummyDevice = devices[0];
    
    // Buat data acak
    const hr = Math.floor(Math.random() * (110 - 55 + 1)) + 55;
    const sp = Math.floor(Math.random() * (100 - 90 + 1)) + 90;
    const hrv_dummy = Math.floor(Math.random() * (70 - 30 + 1)) + 30;
    const sqi_dummy = Math.floor(Math.random() * (100 - 80 + 1)) + 80;
    
    let stat = "NORMAL";
    if (hr > 100 || hr < 60 || sp < 95) {
      stat = "TIDAK NORMAL";
    }
    
    // Simpan ke database (menggunakan null untuk hrv, sqi, timestamp)
    const newLog = await saveToDatabase(dummyDevice.id, hr, sp, stat, hrv_dummy, sqi_dummy, null);
    
    // Siarkan data baru ke semua klien dashboard
    io.emit('update-data', {
      ...newLog, // Kirim semua data log
      device_name: dummyDevice.device_name // Tambahkan nama perangkat
    });
    
    res.status(201).json({ message: 'Dummy data logged successfully', data: newLog });
    
  } catch (error) {
    console.error('Error in GET /api/generate-dummy:', error.message);
    res.status(500).json({ error: 'Server error while generating data' });
  }
});

app.get('/api/ews-history', async (req, res) => {
  const { start, end, device_id } = req.query;
  
  if (!start || !end || !device_id) {
    return res.status(400).json({ error: 'Parameter "start", "end", dan "device_id" diperlukan' });
  }
  
  try {
    const query = `
      SELECT ews_score, timestamp 
      FROM ews_logs
      WHERE device_id = ? AND timestamp BETWEEN ? AND ?
      ORDER BY timestamp ASC 
    `;
    const [rows] = await db.query(query, [device_id, start, end]);
    res.json(rows);
    
  } catch (err) {
    console.error("Database query error in GET /api/ews-history:", err.message);
    res.status(500).json({ error: 'Gagal mengambil riwayat EWS' });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    const [users] = await db.query("SELECT id, full_name, date_of_birth FROM users ORDER BY full_name");
    res.json(users);
  } catch (error) {
    console.error("Gagal mengambil daftar pengguna:", error.message);
    res.status(500).json({ error: 'Gagal mengambil daftar pengguna' });
  }
});


app.post('/api/devices/link-user', async (req, res) => {
  const { deviceId, userId } = req.body;
  if (!deviceId || !userId) {
    return res.status(400).json({ error: 'deviceId dan userId diperlukan' });
  }
  try {
    await db.query("UPDATE devices SET user_id = ? WHERE id = ?", [userId, deviceId]);
    res.json({ message: 'Perangkat berhasil ditautkan!' });
  } catch (error) {
    console.error("Gagal menautkan perangkat:", error.message);
    res.status(500).json({ error: 'Gagal menautkan perangkat' });
  }
});

app.post('/api/users/create-and-link', async (req, res) => {
  const { deviceId, fullName, dateOfBirth, biologicalSex } = req.body;
  
  if (!deviceId || !fullName || !dateOfBirth || !biologicalSex) {
    return res.status(400).json({ error: 'Semua field (nama, tgl lahir, sex) diperlukan' });
  }
  
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    
    // 1. Buat pengguna baru
    const [result] = await connection.query(
      "INSERT INTO users (full_name, date_of_birth, biological_sex) VALUES (?, ?, ?)",
      [fullName, dateOfBirth, biologicalSex]
    );
    const newUserId = result.insertId;
    
    // 2. Tautkan pengguna baru ke perangkat
    await connection.query("UPDATE devices SET user_id = ? WHERE id = ?", [newUserId, deviceId]);
    
    // 3. Commit
    await connection.commit();
    res.status(201).json({ message: 'Pengguna baru berhasil dibuat dan ditautkan!', newUserId: newUserId });
    
  } catch (error) {
    await connection.rollback();
    console.error("Gagal membuat & menautkan pengguna:", error.message);
    res.status(500).json({ error: 'Gagal memproses permintaan' });
  } finally {
    connection.release();
  }
});

app.post('/api/session/start', async (req, res) => {
  const { deviceId, userId } = req.body;
  if (!deviceId || !userId) {
    return res.status(400).json({ error: 'deviceId dan userId diperlukan' });
  }
  
  try {
    await db.query("UPDATE devices SET user_id = ? WHERE id = ?", [userId, deviceId]);
  } catch (dbError) {
    console.error("Gagal update device user_id:", dbError.message);
    return res.status(500).json({ error: 'Gagal memulai sesi di DB' });
  }
  
  // Ambil data profil lengkap pengguna yang baru aktif
  try {
    const [userRows] = await db.query("SELECT * FROM users WHERE id = ?", [userId]);
    const [userCondRows] = await db.query("SELECT condition_id FROM user_conditions WHERE user_id = ?", [userId]);
    const userConditions = userCondRows.map(row => row.condition_id);
    
    const sessionData = {
      user: userRows[0],
      userConditions: userConditions
    };
    
    // Kirim data profil pengguna ke dashboard melalui Socket.IO
    const deviceRoom = `device_${deviceId}`;
    io.to(deviceRoom).emit('session-started', sessionData);
    
    res.json({ message: 'Sesi dimulai', sessionData: sessionData });
    
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data profil' });
  }
});

app.post('/api/session/stop', async (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId diperlukan' });
  }
  try {
    await db.query("UPDATE devices SET user_id = NULL WHERE id = ?", [deviceId]);
    
    console.log(`[SESSION STOP] Sesi untuk Perangkat ${deviceId} dihentikan.`);
    // Beri tahu dashboard bahwa sesi telah berakhir
    const deviceRoom = `device_${deviceId}`;
    io.to(deviceRoom).emit('session-stopped'); //
    res.json({ message: 'Sesi dihentikan' });
    
  } catch (dbError) {
    console.error("Gagal update device user_id ke NULL:", dbError.message);
    return res.status(500).json({ error: 'Gagal menghentikan sesi di DB' });
  }
});

app.get('/api/session/status', async (req, res) => {
  const { deviceId } = req.query;
  if (!deviceId) {
    return res.status(400).json({ error: 'deviceId diperlukan' });
  }
  
  try {
    // 1. Cek perangkat dan lihat siapa user yang tertaut
    const [deviceRows] = await db.query("SELECT * FROM devices WHERE id = ?", [deviceId]);
    if (deviceRows.length === 0) {
      return res.status(404).json({ error: 'Perangkat tidak ditemukan' });
    }
    
    const device = deviceRows[0];
    const activeUserId = device.user_id;
    
    if (!activeUserId) {
      // Tidak ada sesi aktif
      return res.json({ sessionActive: false });
    }
    
    // 2. Jika ADA sesi, ambil data lengkap pengguna
    const [userRows] = await db.query("SELECT * FROM users WHERE id = ?", [activeUserId]);
    const [userCondRows] = await db.query("SELECT condition_id FROM user_conditions WHERE user_id = ?", [activeUserId]);
    const userConditions = userCondRows.map(row => row.condition_id);
    
    // 3. Kirim kembali data sesi lengkap
    res.json({
      sessionActive: true,
      sessionData: {
        device: device,
        user: userRows[0],
        userConditions: userConditions
      }
    });
    
  } catch (error) {
    console.error("Gagal mengambil status sesi:", error.message);
    res.status(500).json({ error: 'Gagal mengambil status sesi' });
  }
});

/**
* Menghitung skor EWS berdasarkan satu set data log.
* Ini adalah 'otak' dari EWS SEHATI.
*/
function calculateEwsScore(logs) {
  let score = 0;
  if (logs.length === 0) return 0;
  
  const latestLog = logs[logs.length - 1];
  
  // 1. Skor SpO2 (berdasarkan nilai terbaru)
  if (latestLog.spo2 < 90) score += 3;
  else if (latestLog.spo2 <= 93) score += 2;
  else if (latestLog.spo2 <= 95) score += 1;
  
  // 2. Skor Detak Jantung (HR) (berdasarkan nilai terbaru)
  if (latestLog.heart_rate < 40 || latestLog.heart_rate > 130) score += 3;
  else if (latestLog.heart_rate <= 50 || latestLog.heart_rate >= 111) score += 2;
  else if (latestLog.heart_rate <= 60 || latestLog.heart_rate >= 91) score += 1;
  
  // 3. Skor Tren (Inovasi SEHATI)
  // Cek data dari 1 jam lalu (jika ada)
  if (logs.length > 5) { // Butuh data yang cukup untuk tren
    const oneHourAgoLog = logs[0]; // (Asumsi cron job mengambil log 1 jam)
    
    // Tren SpO2 menurun
    if (latestLog.spo2 < oneHourAgoLog.spo2 - 3) {
      score += 2; // Tambah 2 poin jika SpO2 turun > 3% dalam sejam
    }
    // Tren HR meningkat
    if (latestLog.heart_rate > oneHourAgoLog.heart_rate + 15) {
      score += 2; // Tambah 2 poin jika HR naik > 15 bpm dalam sejam
    }
  }
  
  return score;
}
async function runEwsCalculationForAllDevices() {
  console.log('[EWS Job] Menjalankan kalkulasi EWS periodik...');
  try {
    const [devices] = await db.query("SELECT id FROM devices WHERE status = 'online'");
    if (devices.length === 0) {
      console.log('[EWS Job] Tidak ada perangkat online. Kalkulasi dihentikan.');
      return; // Menghentikan eksekusi fungsi jika tidak ada perangkat yang online
    }
    for (const device of devices) {
      const [logs] = await db.query(
        "SELECT * FROM sensor_logs WHERE device_id = ? AND timestamp >= NOW() - INTERVAL 1 HOUR ORDER BY timestamp ASC",
        [device.id]
      );
      
      // 2. Hitung skor EWS
      const newEwsScore = calculateEwsScore(logs);
      console.log("EWS Score: ", newEwsScore);
      // 3. Simpan skor baru ke tabel riwayat (ews_logs)
      await db.query("INSERT INTO ews_logs (device_id, ews_score) VALUES (?, ?)", [device.id, newEwsScore]);
      
      // 4. Perbarui skor EWS terbaru di tabel 'devices'
      await db.query("UPDATE devices SET ews_score = ? WHERE id = ?", [newEwsScore, device.id]);
      
      // 5. Siarkan skor baru ke dashboard yang relevan
      const deviceRoom = `device_${device.id}`;
      io.to(deviceRoom).emit('update-ews', {
        device_id: device.id,
        ews_score: newEwsScore,
        timestamp: new Date().toISOString()
      });
      
      console.log(`[EWS Job] Perangkat ${device.id} - Skor EWS baru: ${newEwsScore}`);
    }
  } catch (error) {
    console.error('[EWS Job] Gagal menjalankan kalkulasi EWS:', error.message);
  }
}
// (Format: 'menit jam hari(bulan) bulan hari(minggu)')
cron.schedule('*/15 * * * *', runEwsCalculationForAllDevices);
// --- FUNGSI HELPER DATABASE ---

/**
* Menyimpan log sensor ke database.
* Diperbarui untuk menerima parameter baru (hrv, sqi, timestamp).
*/
async function saveToDatabase(deviceId, userId, hr, sp, stat, hrv, sqi, ts) {
  
  const query = `
    INSERT INTO sensor_logs 
    (device_id, user_id, heart_rate, spo2, status, hrv, sqi, timestamp) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  try {
    const wibTimeZone = "Asia/Jakarta";
    const values = [
      deviceId, 
      userId || null,
      hr || null, 
      sp || null, 
      stat || null, 
      hrv || null, 
      sqi || null, 
      ts || dayjs().tz(wibTimeZone).format("YYYY-MM-DD HH:mm:ss")
    ];
    const [result] = await db.query(query, values);
    
    const newLog = { 
      id: result.insertId,
      device_id: deviceId, 
      user_id: userId, 
      heart_rate: hr || null, 
      spo2: sp || null,
      status: stat || null,
      hrv: hrv || null,
      sqi: sqi || null,
      timestamp: ts || new Date().toISOString() // Kembalikan timestamp
    };
    return newLog; 
    
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

// --- LOGIKA SOCKET.IO (Koneksi Klien Dashboard) ---
io.on('connection', (socket) => {
  console.log('A user connected to dashboard');
  
  // [LOGIKA BARU] Klien harus "bergabung" ke ruangan
  socket.on('join-room', (deviceId) => {
    const roomName = `device_${deviceId}`;
    socket.join(roomName);
    console.log(`User ${socket.id} joined room: ${roomName}`);
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

// --- MULAI SERVER ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});