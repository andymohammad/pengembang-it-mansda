// models/deviceModel.js

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Device = sequelize.define('Device', {
    deviceId: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
        unique: true,
    },
    mode: {
        type: DataTypes.ENUM('AUTO', 'MANUAL'),
        defaultValue: 'AUTO',
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM('ONLINE', 'OFFLINE'),
        defaultValue: 'OFFLINE',
        allowNull: false
    },
    lastSeen: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    water_pump_status: {
        type: DataTypes.ENUM('ON', 'OFF'),
        defaultValue: 'OFF',
    },
    nutrient_pump_status: {
        type: DataTypes.ENUM('ON', 'OFF'),
        defaultValue: 'OFF',
    },
    moisture_min: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    ec_min: {
        type: DataTypes.FLOAT,
        allowNull: true
    }
}, {
    tableName: 'devices',
    timestamps: true, // Automatically add createdAt and updatedAt
});

module.exports = Device;
