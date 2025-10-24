// models/notificationModel.js
const { DataTypes } = require('sequelize');
const sequelize= require('../config/database');

const Notification = sequelize.define('Notification', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    deviceId: {
        type: DataTypes.STRING,
        allowNull: false
    },
    // Tipe log: INFO (Kontrol manual), WARN (Sensor breach), DANGER (Offline)
    type: {
        type: DataTypes.ENUM('INFO', 'WARN', 'DANGER'),
        allowNull: false,
        defaultValue: 'INFO'
    },
    message: {
        type: DataTypes.STRING,
        allowNull: false
    }
    // Kolom 'createdAt' (timestamp) akan ditambahkan secara otomatis oleh Sequelize
}, {
    tableName: 'notifications',
    timestamps: true, // Otomatis mengelola createdAt dan updatedAt
    updatedAt: false // Kita hanya butuh createdAt sebagai timestamp log
});

module.exports = Notification;
