// config/database.js
// =================================================================
// SEQUELIZE DATABASE CONFIGURATION
// =================================================================
// This file creates and configures the Sequelize instance which will
// be used throughout the application to interact with the MySQL database.

const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASS,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false, // Set to console.log to see executed SQL queries
    }
);

module.exports = sequelize;
