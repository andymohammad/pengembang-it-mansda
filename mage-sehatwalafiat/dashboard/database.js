// database.js
require('dotenv').config();
const mysql = require('mysql2');

// 1. Buat Connection Pool
// Pool akan mengelola beberapa koneksi sekaligus
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// 2. Fungsi untuk inisialisasi database (membuat tabel)
const initializeDatabase = () => {
    // Dapatkan satu koneksi dari pool
    pool.getConnection((err, connection) => {
        if (err) {
            console.error('Error connecting to MySQL database:', err);
            // Cek error spesifik jika database tidak ada
            if (err.code === 'ER_BAD_DB_ERROR') {
                console.error(`Database '${process.env.DB_NAME}' not found.`);
                console.log(`Please create the database manually using: CREATE DATABASE ${process.env.DB_NAME};`);
            }
            return;
        }
        
        console.log('Connected to the MySQL database.');
        
        const createDevicesTableQuery = `
            CREATE TABLE IF NOT EXISTS devices (
                id INT PRIMARY KEY AUTO_INCREMENT,
                device_name VARCHAR(100) NOT NULL,
                auth_token VARCHAR(64) NOT NULL UNIQUE,
                status VARCHAR(20) DEFAULT 'offline',
                last_seen DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `;
        
        const createSensorLogsTableQuery = `
            CREATE TABLE IF NOT EXISTS sensor_logs (
                id INT PRIMARY KEY AUTO_INCREMENT,
                device_id INT, /* <-- Kolom Baru */
                heart_rate INT,
                spo2 INT,
                status VARCHAR(20),
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (device_id) REFERENCES devices(id) /* <-- Relasi Baru */
            );
        `;
        
        // Jalankan query untuk membuat tabel
        connection.query(createDevicesTableQuery, (err, results) => {
            if (err) {
                console.error('Error creating "devices" table:', err.message);
                connection.release();
                return;
            }
            console.log('Table "devices" is ready.');
            
            // Setelah tabel devices berhasil dibuat, buat tabel sensor_logs
            connection.query(createSensorLogsTableQuery, (err, results) => {
                // Selalu rilis koneksi kembali ke pool setelah selesai
                connection.release();
                
                if (err) {
                    console.error('Error creating "sensor_logs" table:', err.message);
                    return;
                }
                console.log('Table "sensor_logs" is ready.');
            });
        });
    });
};
// 3. Panggil fungsi inisialisasi saat aplikasi dimulai
initializeDatabase();

// 4. Ekspor pool yang sudah di-promise-kan
// Ini memungkinkan kita menggunakan async/await di server.js
module.exports = pool.promise();