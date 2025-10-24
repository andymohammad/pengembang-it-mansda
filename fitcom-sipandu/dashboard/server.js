// server.js
// =================================================================
// MAIN SERVER FILE (MySQL/Sequelize Version)
// =================================================================
// This file initializes the Express server, connects to the MySQL 
// database via Sequelize, and starts the MQTT client.

// 1. IMPORT NECESSARY MODULES
// -----------------------------------------------------------------
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const sequelize = require('./config/database'); // Import Sequelize instance
const { initializeMQTT } = require('./mqttClient');
const apiRoutes = require('./routes/api');

// Import models to ensure they are known to Sequelize
require('./models/telemetryModel');
require('./models/deviceModel'); // Import the new device model

// 2. INITIALIZE THE EXPRESS APP
// -----------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

// 3. MIDDLEWARE SETUP
// -----------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 4. DATABASE CONNECTION & MODEL SYNC
// -----------------------------------------------------------------
async function connectToDatabase() {
    try {
        await sequelize.authenticate();
        console.log('Successfully connected to MySQL database.');
        await sequelize.sync({ alter: true });
        console.log('Database models synchronized successfully.');
        // Sync all defined models to the DB.
        await sequelize.sync({ alter: true });
        console.log('All models were synchronized successfully.');

        // Initialize MQTT client only after successful DB connection
        initializeMQTT();

    } catch (error) {
        console.error('Database connection error:', error);
        process.exit(1);
    }
}

connectToDatabase();

// 5. API ROUTES
// -----------------------------------------------------------------
app.use('/api', apiRoutes);

// 6. SERVE THE DASHBOARD
// -----------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 7. START THE SERVER
// -----------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

