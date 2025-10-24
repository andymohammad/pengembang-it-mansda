// controllers/deviceController.js
const { Op } = require('sequelize');
// const { sequelize } = require('../config/database');
const sequelize = require('../config/database');

const Telemetry = require('../models/telemetryModel');
const Device = require('../models/deviceModel');
const { publishCommand } = require('../mqttClient');
const Notification = require('../models/notificationModel');

const createNotification = async (deviceId, type, message) => {
    try {
        await Notification.create({ deviceId, type, message });
        console.log(`LOG [${deviceId}]: ${message}`);
    } catch (error) {
        console.error('Failed to create notification:', error);
    }
};

// --- NEW: Function to get all notifications ---
exports.getNotifications = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const notifications = await Notification.findAll({
            where: { deviceId },
            order: [['createdAt', 'DESC']],
            limit: 100 // Batasi 100 log terakhir
        });
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
};

const updateLastSeen = async (deviceId) => {
    let device = await Device.findOne({ where: { deviceId } });
    const now = new Date();

    if (device) {
        // Hanya update lastSeen
        device.lastSeen = now;
        await device.save();
        return device;
    } else {
        // Jika perangkat belum ada (pertama kali data masuk)
        device = await Device.create({
            deviceId: deviceId,
            lastSeen: now,
            mode: 'MANUAL', // Default mode
            status: 'ONLINE' // Default status saat pertama kali dibuat
        });
        // Log untuk perangkat baru tetap dibuat di sini
        createNotification(deviceId, 'INFO', 'Perangkat baru terdeteksi dan online.');
        return device;
    }
};

// CREATE: Menerima data telemetri dan menyimpannya (Sequelize compatible)
exports.createTelemetry = async (telemetryData) => {
    try {
        await Telemetry.create(telemetryData);
        await updateLastSeen(telemetryData.deviceId);
        console.log('Telemetry saved:', telemetryData.deviceId);
    } catch (error) {
        console.error('Error saving telemetry:', error);
    }
};

// FUNGSI BARU: Menerima data telemetri dari HTTP POST (untuk Postman)
exports.createTelemetryFromHttp = async (req, res) => {
    try {
        const telemetryData = req.body;
        if (!telemetryData.deviceId || telemetryData.ph == null || telemetryData.moisture == null || telemetryData.ec == null) {
            return res.status(400).json({ message: 'Payload tidak lengkap. Pastikan berisi deviceId, ph, moisture, dan ec.' });
        }
        await exports.createTelemetry(telemetryData);

        const deviceConfig = await Device.findOne({
            where: { deviceId: telemetryData.deviceId }
        });

        res.status(200).json({ 
            message: 'Telemetry saved.', 
            config: deviceConfig // <-- Konfigurasi disisipkan di sini
        });
        // res.status(200).json({ message: 'Dummy telemetry data successfully received and saved!', data: telemetryData });
    } catch (error) {
        res.status(500).json({ message: 'Failed to process dummy telemetry data', error: error.message });
    }
};

exports.getAllDevices = async (req, res) => {
    try {
        const devices = await Device.findAll({
            attributes: ['deviceId'],
            group: ['deviceId']
        });
        res.status(200).json(devices);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching devices', error: error.message });
    }
};

// --- UPDATED: setControlState now creates a log ---
exports.setControlState = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { mode, water_pump_status, nutrient_pump_status } = req.body;

        if (mode === undefined || water_pump_status === undefined || nutrient_pump_status === undefined) {
            return res.status(400).json({ message: 'Payload tidak lengkap.' });
        }
        
        const waterStatusStr = water_pump_status ? 'ON' : 'OFF';
        const nutrientStatusStr = nutrient_pump_status ? 'ON' : 'OFF';

        const [device, created] = await Device.findOrCreate({
            where: { deviceId },
            defaults: { 
                deviceId, mode,
                water_pump_status: waterStatusStr,
                nutrient_pump_status: nutrientStatusStr,
                lastSeen: new Date() 
            }
        });

        if (!created) {
            device.mode = mode;
            device.water_pump_status = waterStatusStr;
            device.nutrient_pump_status = nutrientStatusStr;
            await device.save();
        }

        // --- Logging ---
        createNotification(deviceId, 'INFO', `Kontrol Manual: Mode diatur ke ${mode}, Pompa Air ${waterStatusStr}, Pompa Pupuk ${nutrientStatusStr}.`);
        // --- End Logging ---

        const configTopic = `sipandu/config/${deviceId}`;
        const configPayload = JSON.stringify({ mode: mode });
        publishCommand(configTopic, configPayload);

        if (mode === 'MANUAL') {
            const commandTopic = `sipandu/cmd/${deviceId}`;
            const commandPayload = JSON.stringify({
                water_pump: water_pump_status,
                nutrient_pump: nutrient_pump_status
            });
            publishCommand(commandTopic, commandPayload);
        }

        res.status(200).json({ message: `Control state for ${deviceId} has been updated.`, newState: device });

    } catch (error) {
        res.status(500).json({ message: 'Error setting control state', error: error.message });
    }
};
// FUNGSI BARU: Generate data telemetri acak dalam jumlah besar
exports.generateDummyData = async (req, res) => {
    try {
        const { deviceId, count = 50, timeRangeInHours = 24 } = req.body;

        if (!deviceId) {
            return res.status(400).json({ message: 'deviceId harus disertakan.' });
        }

        const dummyData = [];
        const now = new Date();
        const startTime = new Date(now.getTime() - timeRangeInHours * 60 * 60 * 1000);

        for (let i = 0; i < count; i++) {
            // Generate nilai acak untuk setiap sensor
            const randomPh = (Math.random() * (7.5 - 5.5) + 5.5).toFixed(1);
            const randomMoisture = (Math.random() * (80 - 30) + 30).toFixed(1);
            const randomEc = Math.floor(Math.random() * (500 - 150) + 150);
            
            // Generate timestamp acak dalam rentang waktu yang ditentukan
            const randomTimestamp = new Date(startTime.getTime() + Math.random() * (now.getTime() - startTime.getTime()));

            dummyData.push({
                deviceId,
                ph: randomPh,
                moisture: randomMoisture,
                ec: randomEc,
                timestamp: randomTimestamp
            });
        }

        // Simpan semua data ke database dalam satu operasi
        await Telemetry.bulkCreate(dummyData);

        res.status(201).json({ 
            message: `${count} data telemetri acak berhasil dibuat untuk perangkat ${deviceId} dalam rentang ${timeRangeInHours} jam terakhir.` 
        });

    } catch (error) {
        res.status(500).json({ message: 'Gagal membuat data dummy', error: error.message });
    }
};

exports.getTelemetry = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { range } = req.query; 
        
        let startDate;
        const now = new Date();

        switch (range) {
            case '1d': startDate = new Date(now.setDate(now.getDate() - 1)); break;
            case '7d': startDate = new Date(now.setDate(now.getDate() - 7)); break;
            case '1m': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
            case '3m': startDate = new Date(now.setMonth(now.getMonth() - 3)); break;
            case '6m': startDate = new Date(now.setMonth(now.getMonth() - 6)); break;
        }

        const whereClause = { deviceId };

        if (startDate) {
            whereClause.timestamp = { [Op.gte]: startDate };
        }

        // 1. Get Analytics Data
        const analytics = await Telemetry.findOne({
            where: whereClause,
            attributes: [
                [sequelize.fn('AVG', sequelize.col('ph')), 'avg_ph'],
                [sequelize.fn('MIN', sequelize.col('ph')), 'min_ph'],
                [sequelize.fn('MAX', sequelize.col('ph')), 'max_ph'],
                [sequelize.fn('AVG', sequelize.col('moisture')), 'avg_moisture'],
                [sequelize.fn('MIN', sequelize.col('moisture')), 'min_moisture'],
                [sequelize.fn('MAX', sequelize.col('moisture')), 'max_moisture'],
                [sequelize.fn('AVG', sequelize.col('ec')), 'avg_ec'],
                [sequelize.fn('MIN', sequelize.col('ec')), 'min_ec'],
                [sequelize.fn('MAX', sequelize.col('ec')), 'max_ec'],
            ],
            raw: true, // Return plain JSON object
        });
        
        // 2. Get History Data
        const historyQueryOptions = {
            where: whereClause,
            order: [['timestamp', 'DESC']],
        };

        if (range === 'realtime') {
            historyQueryOptions.limit = 100;
        }

        const history = await Telemetry.findAll(historyQueryOptions);
        
        // Return both in one object
        res.status(200).json({ history, analytics });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching telemetry', error: error.message });
    }
};

exports.getLatestTelemetry = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const latestTelemetry = await Telemetry.findOne({
            where: { deviceId },
            order: [['timestamp', 'DESC']]
        });

        let device = await Device.findOne({ where: { deviceId } });
        let currentDbStatus = 'OFFLINE'; // Default jika device belum ada

        if (device) {
             currentDbStatus = device.status; // Ambil status dari DB jika device ada
        } else {
             // Jika device tidak ditemukan saat getLatest, kemungkinan besar offline
             return res.status(404).json({ status: 'OFFLINE', message: 'Device not found' });
        }

        const now = new Date();
        const lastSeen = device.lastSeen ? new Date(device.lastSeen) : new Date(0);
        const offlineThreshold = 5 * 60 * 1000;
        const calculatedStatus = (now - lastSeen) < offlineThreshold ? 'ONLINE' : 'OFFLINE';

        // --- Centralized Logging Logic (ANTI-SPAM) ---
        // Hanya lakukan update dan log JIKA status yang dihitung berbeda dari status di DB
        if (calculatedStatus !== currentDbStatus) {
            device.status = calculatedStatus; // Update status objek device
            await device.save(); // Simpan perubahan status ke DB

            // Buat notifikasi HANYA setelah status berhasil disimpan
            if (calculatedStatus === 'ONLINE') {
                createNotification(deviceId, 'INFO', 'Perangkat kembali online.');
            } else {
                createNotification(deviceId, 'DANGER', 'Perangkat offline. Sinyal terputus.');
            }
        }
        // --- End Centralized Logging Logic ---

        res.status(200).json({
            status: calculatedStatus, // Kirim status yang baru dihitung
            telemetry: latestTelemetry,
            device: device, // Kirim data device yang statusnya sudah terupdate jika berubah
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching latest data', error: error.message });
    }
};


// COMMAND: Mengirim perintah ke perangkat via MQTT
exports.sendCommand = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { command, value } = req.body;

        const device = await Device.findOne({ where: { deviceId } });

        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }
        
        if (device.mode !== 'MANUAL') {
            return res.status(403).json({ message: `Cannot send command. Device is in ${device.mode} mode.` });
        }

        const topic = `sipandu/cmd/${deviceId}`;
        const payload = JSON.stringify({ [command]: value });

        publishCommand(topic, payload);
        
        if (command === 'water_pump') device.water_pump_status = value;
        if (command === 'nutrient_pump') device.nutrient_pump_status = value;
        
        await device.save();

        res.status(200).json({ message: `Command '${command}: ${value}' sent to ${deviceId}` });
    } catch (error) {
        res.status(500).json({ message: 'Error sending command', error: error.message });
    }
};

// SET MODE: Set the device's operational mode (AUTO/MANUAL)
exports.setDeviceMode = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { mode } = req.body;

        if (mode !== 'AUTO' && mode !== 'MANUAL') {
            return res.status(400).json({ message: 'Invalid mode. Use "AUTO" or "MANUAL".' });
        }

        const [device, created] = await Device.findOrCreate({
            where: { deviceId },
            defaults: { mode: mode, lastSeen: new Date() }
        });

        if (!created) {
            device.mode = mode;
            await device.save();
        }
        
        const topic = `sipandu/config/${deviceId}`;
        const payload = JSON.stringify({ mode: mode });
        publishCommand(topic, payload);

        res.status(200).json({ message: `Device ${deviceId} mode set to ${mode}` });

    } catch (error) {
        res.status(500).json({ message: 'Error setting device mode', error: error.message });
    }
};

exports.setDeviceConfig = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const configData = req.body;

        const [device] = await Device.findOrCreate({
            where: { deviceId },
        });

        const updatePayload = {};
        const mqttPayload = {};
        let logMessage = 'Konfigurasi diperbarui: ';
        let changed = false; // Flag untuk melacak apakah ada perubahan

        // Bandingkan dan update mode
        if (configData.mode !== undefined && ['AUTO', 'MANUAL'].includes(configData.mode) && device.mode !== configData.mode) {
            device.mode = configData.mode;
            updatePayload.mode = configData.mode;
            mqttPayload.mode = configData.mode;
            logMessage += `Mode -> ${configData.mode}. `;
            changed = true;
        }

        // Bandingkan dan update setpoints
        if (configData.setpoints) {
            const setpoints = configData.setpoints;
            mqttPayload.setpoints = {};
            if (setpoints.moisture_min !== undefined && device.moisture_min !== setpoints.moisture_min) {
                device.moisture_min = setpoints.moisture_min;
                updatePayload.moisture_min = setpoints.moisture_min;
                mqttPayload.setpoints.moisture_min = setpoints.moisture_min;
                logMessage += `Min Kelembapan -> ${setpoints.moisture_min}%. `;
                changed = true;
            }
            if (setpoints.ec_min !== undefined && device.ec_min !== setpoints.ec_min) {
                device.ec_min = setpoints.ec_min;
                updatePayload.ec_min = setpoints.ec_min;
                mqttPayload.setpoints.ec_min = setpoints.ec_min;
                logMessage += `Min EC -> ${setpoints.ec_min}. `;
                changed = true;
            }
        }

        // Hanya simpan dan kirim MQTT jika ada perubahan
        if (changed) {
            await device.save();

            if (Object.keys(mqttPayload).length > 0) {
                const topic = `sipandu/config/${deviceId}`;
                publishCommand(topic, JSON.stringify(mqttPayload));
            }

            // --- Logging ---
            createNotification(deviceId, 'INFO', logMessage);
        } else {
             logMessage = 'Tidak ada perubahan konfigurasi.';
        }


        res.status(200).json({ message: changed ? `Konfigurasi untuk ${deviceId} berhasil diperbarui.` : 'Tidak ada perubahan konfigurasi.', newConfig: changed ? updatePayload : {} });

    } catch (error) {
        res.status(500).json({ message: 'Gagal mengatur konfigurasi perangkat', error: error.message });
    }
};