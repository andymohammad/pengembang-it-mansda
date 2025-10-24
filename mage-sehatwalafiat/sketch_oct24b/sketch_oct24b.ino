#include <Wire.h>
#include <SPI.h>
#include <WiFi.h>
#include <HTTPClient.h>

#include "Adafruit_GFX.h"
#include "Adafruit_ST7735.h"
#include "MAX30105.h"

// --- 1. PENGATURAN (HARAP DISESUAIKAN) ---

// Pengaturan Wi-Fi (Hotspot HP Anda)
const char* ssid = "NAMA_HOTSPOT_HP_ANDA";
const char* password = "PASSWORD_HOTSPOT_ANDA";

// Pengaturan Server (Endpoint API)
const char* serverUrl = "http://example.com/api/healthdata";

// Pengaturan Pin LCD TFT 1.44"
// Sesuaikan pin ini dengan cara Anda menyambungkannya
#define TFT_CS    5  // Chip Select
#define TFT_RST   4  // Reset
#define TFT_DC    2  // Data/Command
// Pin SPI (biarkan default untuk ESP32):
// SCK/SCLK -> 18
// SDA/MOSI -> 23

// Pengaturan Pin I2C (Sensor MAX30102)
// Biarkan default untuk ESP32:
// SCL -> 22
// SDA -> 21

// --- 2. INISIALISASI OBJEK GLOBAL ---

MAX30105 particleSensor;
Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);

unsigned long lastSendTime = 0;
const long sendInterval = 30000; // Kirim data tiap 30 detik

float currentHR = 0.0;
float currentSpO2 = 0.0;
String currentStatus = "Initializing";

// --- 3. FUNGSI SETUP ---

void setup() {
  Serial.begin(115200);
  Serial.println("Memulai SEHATWALAFIAT...");

  initTFT();
  initSensor();
  setupWiFi();
}

// --- 4. FUNGSI LOOP UTAMA ---

void loop() {
  readSensor();
  displayDataOnTFT();

  unsigned long currentTime = millis();
  if (currentTime - lastSendTime > sendInterval) {
    lastSendTime = currentTime;

    if (currentHR > 0 && currentSpO2 > 0) {
      Serial.println("Waktunya kirim data...");
      handleDataTransmission(currentHR, currentSpO2, currentStatus);
    } else {
      Serial.println("Data sensor belum valid, pengiriman ditunda.");
    }
  }
}

// --- 5. FUNGSI INISIALISASI ---

void initTFT() {
  tft.initR(INITR_144GREENTAB); // Inisialisasi driver LCD 1.44"
  tft.fillScreen(ST7735_BLACK);
  tft.setRotation(1); // Sesuaikan rotasi jika perlu
  tft.setCursor(5, 10);
  tft.setTextColor(ST7735_WHITE);
  tft.setTextSize(1);
  tft.println("SEHATWALAFIAT");
  tft.println("Initializing sensor...");
  Serial.println("TFT OK.");
}

void initSensor() {
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("Sensor MAX30102 Gagal!");
    tft.println("Sensor Gagal!");
    while (1);
  }
  Serial.println("Sensor OK.");
  tft.println("Sensor OK.");

  particleSensor.setup(); 
  particleSensor.setPulseAmplitudeRed(0x0A); 
  particleSensor.setPulseAmplitudeGreen(0); 
}

void setupWiFi() {
  Serial.print("Menghubungkan ke WiFi: ");
  Serial.println(ssid);
  tft.println("Connecting to WiFi...");

  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    tft.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Terhubung!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    tft.println("\nWiFi Terhubung!");
  } else {
    Serial.println("\nGagal terhubung WiFi.");
    tft.println("\nWiFi Gagal!");
  }
  delay(1000); // Tahan pesan status
}

// --- 6. FUNGSI UTAMA ---

void readSensor() {
  particleSensor.check(); 
  
  if (particleSensor.available()) {
    currentHR = particleSensor.getHeartRate();
    currentSpO2 = particleSensor.getSpO2();

    if (currentHR < 255 && currentSpO2 < 100 && currentHR > 30 && currentSpO2 > 50) {
      if (currentSpO2 < 90) {
        currentStatus = "Darurat";
      } else if (currentSpO2 < 95) {
        currentStatus = "Waspada";
      } else if (currentHR < 60 || currentHR > 100) {
        currentStatus = "Waspada";
      } else {
        currentStatus = "Normal";
      }
    } else {
      currentStatus = "Letakkan Jari...";
      currentHR = 0;
      currentSpO2 = 0;
    }
  }
}

void displayDataOnTFT() {
  tft.fillScreen(ST7735_BLACK);
  tft.setCursor(0, 5);
  
  // Set ukuran teks besar untuk data
  tft.setTextColor(ST7735_RED, ST7735_BLACK);
  tft.setTextSize(2);
  tft.print("HR: ");
  tft.print(currentHR, 0);
  tft.println(" bpm");
  
  tft.setCursor(0, 35);
  tft.setTextColor(ST7735_CYAN, ST7735_BLACK);
  tft.setTextSize(2);
  tft.print("SpO2: ");
  tft.print(currentSpO2, 0);
  tft.println(" %");

  tft.setCursor(0, 80);
  tft.setTextSize(2);
  
  if (currentStatus == "Normal") {
    tft.setTextColor(ST7735_GREEN, ST7735_BLACK);
  } else if (currentStatus == "Waspada") {
    tft.setTextColor(ST7735_YELLOW, ST7735_BLACK);
  } else if (currentStatus == "Darurat") {
    tft.setTextColor(ST7735_RED, ST7735_BLACK);
  } else {
    tft.setTextColor(ST7735_WHITE, ST7735_BLACK);
  }
  tft.println(currentStatus);

  // Status Koneksi
  tft.setTextSize(1);
  tft.setCursor(0, 115);
  tft.setTextColor(ST7735_WHITE, ST7735_BLACK);
  if (WiFi.status() == WL_CONNECTED) {
    tft.print("WiFi: Terhubung");
  } else {
    tft.print("WiFi: Terputus");
  }
}

void handleDataTransmission(float hr, float spo2, String status) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Koneksi WiFi terputus. Mencoba sambung ulang...");
    setupWiFi(); 
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Gagal mengirim data. WiFi tidak terhubung.");
      return;
    }
  }

  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\"idPerangkat\":\"ESP32_SEHATWALAFIAT_01\",";
  payload += "\"detakJantung\":" + String(hr, 0) + ",";
  payload += "\"saturasiOksigen\":" + String(spo2, 0) + ",";
  payload += "\"status\":\"" + status + "\"";
  payload += "}";

  Serial.println("Mengirim payload: " + payload);

  int httpResponseCode = http.POST(payload);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    Serial.println(response);
  } else {
    Serial.print("Error code: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}