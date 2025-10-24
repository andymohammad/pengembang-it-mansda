// mqttClient.js
// =================================================================
// MQTT CLIENT LOGIC
// =================================================================
// This module handles connecting to the MQTT broker, subscribing 
// to topics, and processing incoming messages.

const mqtt = require('mqtt');
const Telemetry = require('./models/telemetryModel'); // Import the database model

let client; // Hold the client instance

// Function to initialize and connect the MQTT client
const initializeMQTT = () => {
    const options = {
        clientId: `mqtt_backend_${Math.random().toString(16).slice(2, 8)}`,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
    };

    // 1. CONNECT TO THE MQTT BROKER
    // -----------------------------------------------------------------
    const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://127.0.0.1';
    client = mqtt.connect(brokerUrl, options);

    // 2. HANDLE CONNECTION EVENT
    // -----------------------------------------------------------------
    client.on('connect', () => {
        console.log('Successfully connected to MQTT broker.');
        
        // 3. SUBSCRIBE TO TOPICS
        // -------------------------------------------------------------
        // Subscribe to the telemetry topic from all devices.
        // The '+' is a single-level wildcard.
        client.subscribe('devices/+/telemetry', (err) => {
            if (!err) {
                console.log('Subscribed to telemetry topic: devices/+/telemetry');
            } else {
                console.error('Subscription error:', err);
            }
        });
    });

    // 4. HANDLE INCOMING MESSAGES
    // -----------------------------------------------------------------
    client.on('message', async (topic, message) => {
        console.log(`Received message from topic: ${topic}`);
        console.log(`Message: ${message.toString()}`);

        try {
            // Extract device ID from the topic string
            const deviceId = topic.split('/')[1]; 
            const payload = JSON.parse(message.toString());

            // Create a new telemetry record
            const newTelemetry = new Telemetry({
                deviceId: deviceId,
                ph: payload.ph,
                moisture: payload.moisture,
                ec: payload.ec,
                timestamp: new Date() // Server-side timestamp for consistency
            });

            // Save the record to the database
            await newTelemetry.save();
            console.log(`Saved telemetry data for device ${deviceId}`);

        } catch (error) {
            console.error('Error processing MQTT message:', error);
        }
    });

    // 5. HANDLE ERRORS AND RECONNECTION
    // -----------------------------------------------------------------
    client.on('error', (err) => {
        console.error('MQTT Client Error:', err);
    });

    client.on('reconnect', () => {
        console.log('Reconnecting to MQTT broker...');
    });

    client.on('close', () => {
        console.log('MQTT connection closed.');
    });
};

// Function to publish a message (used for sending commands)
const publishCommand = (deviceId, command) => {
    if (client && client.connected) {
        const topic = `devices/${deviceId}/cmd`;
        const message = JSON.stringify(command);
        client.publish(topic, message, { qos: 1 }, (err) => {
            if (err) {
                console.error('Failed to publish command:', err);
            } else {
                console.log(`Command published to ${topic}: ${message}`);
            }
        });
    } else {
        console.error('MQTT client not connected. Cannot publish command.');
    }
};

module.exports = { initializeMQTT, publishCommand };
