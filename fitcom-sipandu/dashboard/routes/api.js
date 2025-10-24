// routes/api.js

const express = require('express');
const router = express.Router();
const deviceController = require('../controllers/deviceController');

// --- Rute Daftar Perangkat ---
router.get('/devices', deviceController.getAllDevices);

// --- Rute Operasional ---
router.get('/devices/:deviceId/latest', deviceController.getLatestTelemetry);
router.get('/devices/:deviceId/telemetry', deviceController.getTelemetry);
router.post('/devices/:deviceId/control-state', deviceController.setControlState);

// --- Rute Konfigurasi ---
router.post('/devices/:deviceId/mode', deviceController.setDeviceMode); 
router.post('/devices/:deviceId/config', deviceController.setDeviceConfig);

// --- NEW: Rute Log Peristiwa/Notifikasi ---
router.get('/devices/:deviceId/notifications', deviceController.getNotifications);

// --- Rute untuk Pengujian ---
router.post('/devices/dummy-telemetry', deviceController.createTelemetryFromHttp);
router.post('/devices/generate-dummy-data', deviceController.generateDummyData);

module.exports = router;

