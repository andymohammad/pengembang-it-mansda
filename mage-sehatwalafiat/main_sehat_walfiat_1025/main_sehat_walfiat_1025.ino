// sehatwalafiatsehati@gmail.com
// sehati123

#define BLYNK_TEMPLATE_ID "TMPL6-wRKgAjp"
#define BLYNK_TEMPLATE_NAME "Hadyan"
#define BLYNK_AUTH_TOKEN "HSMbxwHyb9MEBtEXjsy9euf7kIOywx-R"

#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <SPI.h>
#include <Wire.h>
#include <WiFi.h>
#include "MAX30105.h"
#include "spo2_algorithm.h"
#include <BlynkSimpleEsp32.h>

char auth[] = BLYNK_AUTH_TOKEN;

// ========================
// PENGATURAN WIFI
// ========================
const char* ssid = "Ruijie";  // Ganti dengan WiFi kamu
const char* password = "robotika999";

#define VPIN_HR V1
#define VPIN_SPO2 V2
#define VPIN_STATUS V3
bool wifiConnected = false;
unsigned long lastReconnectAttempt = 0;
const unsigned long reconnectInterval = 5000;  // setiap 5 detik cek koneksi

// ========================
// PIN TFT
// ========================
#define TFT_CS 15
#define TFT_DC 2
#define TFT_RST 4
#define TFT_SCL 18
#define TFT_SDA 23

Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);

// ========================
// PIN MAX30102
// ========================
#define MAX30102_SDA 21
#define MAX30102_SCL 22

MAX30105 particleSensor;

// ========================
// VARIABEL UNTUK ALGORITMA SpO2
// ========================
#define MAX_BRIGHTNESS 255
// Buffer disesuaikan dengan jumlah sampel yang dipakai
uint32_t irBuffer[100];
uint32_t redBuffer[100];
int32_t bufferLength;
int32_t spo2;
int8_t validSPO2;
int32_t heartRate;
int8_t validHeartRate;

// ========================
// FUNGSI SETUP
// ========================
void setup() {
  Serial.begin(115200);
  SPI.begin(TFT_SCL, -1, TFT_SDA, TFT_CS);

  tft.initR(INITR_144GREENTAB);
  tft.setRotation(0);
  tft.fillScreen(ST77XX_BLACK);

  tampilkanLoadingScreen();

  Wire.begin(MAX30102_SDA, MAX30102_SCL);
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("MAX30102 tidak ditemukan!");
    while (1)
      ;
  }

  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeGreen(0);

  tampilkanHeader();
  setupWiFi();

  if (wifiConnected) {
    Blynk.config(auth);
    Blynk.connect();
  }
}

// ========================
// LOOP UTAMA
// ========================
void loop() {
  Blynk.run();
  checkWiFiConnection();

  // Reconnect Blynk setelah WiFi kembali (jaga-jaga)
  if (wifiConnected && !Blynk.connected()) {
    Blynk.connect();
  }

  bufferLength = 100;  // sesuai ukuran buffer
  for (byte i = 0; i < bufferLength; i++) {
    while (particleSensor.available() == false) {
      particleSensor.check();
    }
    redBuffer[i] = particleSensor.getRed();
    irBuffer[i] = particleSensor.getIR();
    particleSensor.nextSample();
  }

  maxim_heart_rate_and_oxygen_saturation(
    irBuffer, bufferLength, redBuffer,
    &spo2, &validSPO2, &heartRate, &validHeartRate);

  int hr = (validHeartRate) ? heartRate : 0;
  int spo2_val = (validSPO2) ? spo2 : 0;
  bool normal = (validHeartRate && validSPO2 && hr >= 60 && hr <= 100 && spo2_val >= 90);

  tampilkanData(hr, spo2_val, normal, validHeartRate, validSPO2);

  // Kirim ke Blynk (tetap seperti semula)
  if (Blynk.connected()) {
    Blynk.virtualWrite(VPIN_HR, hr);
    Blynk.virtualWrite(VPIN_SPO2, spo2_val);
    if (normal) {
      Blynk.virtualWrite(VPIN_STATUS, "NORMAL");
    } else {
      Blynk.virtualWrite(VPIN_STATUS, "TIDAK NORMAL");
    }
  }

  // Kurangi frekuensi kirim agar tidak banjir data (2–5 detik).
  delay(3000);  // 3 detik
}

// ========================
// FUNGSI WIFI
// ========================
void setupWiFi() {
  Serial.print("Menghubungkan ke WiFi ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  int tries = 0;

  while (WiFi.status() != WL_CONNECTED && tries < 20) {
    delay(500);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\nWiFi Terhubung!");
  } else {
    wifiConnected = false;
    Serial.println("\nGagal terhubung WiFi!");
  }
}

void checkWiFiConnection() {
  if (WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    if (millis() - lastReconnectAttempt >= reconnectInterval) {
      lastReconnectAttempt = millis();
      Serial.println("Koneksi WiFi terputus, mencoba sambung ulang...");
      WiFi.disconnect();
      WiFi.reconnect();
      delay(500);
      if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        Serial.println("WiFi tersambung kembali!");
      } else {
        Serial.println("Gagal menyambung ulang WiFi.");
      }
    }
  } else {
    wifiConnected = true;
  }
}

// ========================
// SEMUA FUNGSI TAMPILAN LCD DIBIARKAN UTUH
// ========================

void tampilkanLoadingScreen() {
  tft.fillScreen(ST77XX_BLACK);
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_WHITE);
  const char* title = "SEHATI";
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(title, 0, 0, &x1, &y1, &w, &h);
  int16_t textCenterX = (128 - w) / 2;
  tft.setCursor(textCenterX, 100);
  tft.println(title);

  int curveY = 60;
  int amplitude = 20;
  int wavelength = 40;

  unsigned long startTime = millis();
  while (millis() - startTime < 3000) {
    tft.fillRect(0, curveY - amplitude - 5, 128, 2 * amplitude + 10, ST77XX_BLACK);
    float shift = (millis() - startTime) / 100.0;
    for (int x = 0; x < 128; x++) {
      float y = curveY + amplitude * sin(2 * PI * (x + shift) / wavelength);
      tft.drawPixel(x, y, ST77XX_GREEN);
    }
    delay(50);
  }
}

void tampilkanHeader() {
  tft.fillScreen(ST77XX_BLACK);
  const char* title = "SEHATI";
  tft.setTextSize(2);
  tft.setTextColor(ST77XX_CYAN);
  int16_t x1, y1;
  uint16_t w, h;
  tft.getTextBounds(title, 0, 0, &x1, &y1, &w, &h);
  int16_t centerX = (128 - w) / 2;
  tft.setCursor(centerX, 10);
  tft.println(title);
  tft.drawLine(10, 32, 118, 32, ST77XX_WHITE);
}

void tampilkanData(int hr, int spo2, bool normal, int8_t validHR, int8_t validSpO2) {
  tft.fillRect(0, 35, 128, 90, ST77XX_BLACK);

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(5, 48);
  tft.print("HR  : ");
  if (validHR) {
    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(2);
    tft.setCursor(40, 45);
    tft.print(hr);
    tft.println(" bpm");
  } else {
    tft.setTextColor(ST77XX_RED);
    tft.setCursor(45, 48);
    tft.println("membaca...");
  }

  tft.setTextColor(ST77XX_WHITE);
  tft.setTextSize(1);
  tft.setCursor(5, 78);
  tft.print("SpO2: ");
  if (validSpO2) {
    tft.setTextColor(ST77XX_YELLOW);
    tft.setTextSize(2);
    tft.setCursor(40, 75);
    tft.print(spo2);
    tft.println("%");
  } else {
    tft.setTextColor(ST77XX_RED);
    tft.setCursor(45, 78);
    tft.println("membaca...");
  }

  tft.setTextSize(1);
  if (validHR && validSpO2) {
    if (normal) {
      tft.setTextColor(ST77XX_GREEN);
      tft.setCursor(2, 105);
      tft.println("STATUS: NORMAL    ");
    } else {
      bool abnormalHR = false;
      bool abnormalSpO2 = false;

      if (hr > 100 || (hr < 60 && hr > 0)) abnormalHR = true;
      if (spo2 < 90 && spo2 > 0) abnormalSpO2 = true;

      tft.setTextColor(ST77XX_RED);
      tft.setCursor(2, 100);
      tft.println("PERINGATAN!");

      if (abnormalHR && abnormalSpO2) {
        tft.setCursor(2, 113);
        tft.println("KONDISI TIDAK NORMAL!");
      } else if (abnormalHR) {
        if (hr > 100) {
          tft.setCursor(2, 113);
          tft.println("DETAK JANTUNG TINGGI!");
        } else if (hr < 60 && hr > 0) {
          tft.setCursor(2, 113);
          tft.println("DETAK JANTUNG RENDAH!");
        }
      } else if (abnormalSpO2) {
        tft.setCursor(2, 113);
        tft.println("KADAR OKSIGEN RENDAH!");
      }
    }
  } else {
    tft.setTextColor(ST77XX_RED);
    tft.setCursor(2, 105);
    tft.println("PERBAIKI POSISI JARI");
  }

  Serial.print("HR: ");
  Serial.print(hr);
  Serial.print(" | SpO2: ");
  Serial.print(spo2);
  Serial.print(" | Valid HR: ");
  Serial.print(validHR);
  Serial.print(" | Valid SpO2: ");
  Serial.print(validSpO2);
  Serial.print(" | Status: ");
  Serial.println(normal ? "Normal" : "Tidak Normal");
}
