// models/telemetryModel.js
// =================================================================
// SEQUELIZE DATA MODEL (MySQL/Sequelize Version)
// =================================================================
// This file defines the 'Telemetries' table schema for MySQL
// using Sequelize.

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Telemetry = sequelize.define('Telemetry', {
    // Model attributes are defined here
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    deviceId: {
        type: DataTypes.STRING,
        allowNull: false,
        comment: 'Unique identifier for the IoT device'
    },
    ph: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    moisture: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    ec: {
        type: DataTypes.FLOAT,
        allowNull: false
    },
    timestamp: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    // Other model options go here
    timestamps: false, // We are using a custom 'timestamp' field
    indexes: [
        // Adding indexes for faster queries
        { fields: ['deviceId'] },
        { fields: ['timestamp'] },
        { fields: ['deviceId', 'timestamp'] }
    ]
});

module.exports = Telemetry;

