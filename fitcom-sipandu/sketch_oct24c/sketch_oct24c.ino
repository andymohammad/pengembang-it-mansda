#include <WiFi.h>
#include <HTTPClient.h>

// =====================
// KONFIGURASI
// =====================
const char* WIFI_SSID = "RELT2";
const char* WIFI_PASSWORD = "robotika999";
const char* SERVER_URL = "http://103.164.117.242:3000/api/devices/dummy-telemetry";
const char* DEVICE_ID = "device-kebun-A1";

// Pin Relay
#define relayPin13 13
#define relayPin14 14
#define MATI HIGH
#define NYALA LOW

// RS485
static const int RXD2 = 16;
static const int TXD2 = 17;
const uint32_t RS485_BAUD = 4800;
const uint8_t SLAVE_ID = 0x01;
const uint32_t TIMEOUT_MS = 600;

// Variabel global sensor
float phTanah = NAN, conduc = NAN, mois = NAN;
int status_relayPin13 = MATI;
int status_relayPin14 = MATI;
String modeDevice = "AUTO";  // dari server (AUTO/MANUAL)

// =====================
// UTILITAS MODBUS (SAMA)
// =====================
uint16_t crc16_modbus(const uint8_t *buf, size_t len) {
  uint16_t crc = 0xFFFF;
  for (size_t i = 0; i < len; i++) {
    crc ^= buf[i];
    for (int b = 0; b < 8; b++) crc = (crc & 1) ? (crc >> 1) ^ 0xA001 : (crc >> 1);
  }
  return crc;
}

bool readHolding(uint8_t id, uint16_t addr, uint16_t qty, uint8_t *resp, size_t &respLen) {
  uint8_t req[8] = { id, 0x03, (uint8_t)(addr >> 8), (uint8_t)addr, (uint8_t)(qty >> 8), (uint8_t)qty, 0, 0 };
  uint16_t c = crc16_modbus(req, 6);
  req[6] = (uint8_t)(c & 0xFF);
  req[7] = (uint8_t)(c >> 8);
  while (Serial2.available()) (void)Serial2.read();
  Serial2.write(req, 8);
  Serial2.flush();
  const size_t need = 3 + 2 * qty + 2;
  size_t idx = 0;
  uint32_t t0 = millis();
  while (millis() - t0 < TIMEOUT_MS && idx < need) {
    if (Serial2.available()) resp[idx++] = (uint8_t)Serial2.read();
  }
  if (idx < need || resp[0] != id || resp[1] != 0x03) return false;
  uint16_t rxcrc = (uint16_t)resp[idx - 1] << 8 | resp[idx - 2];
  uint16_t calcc = crc16_modbus(resp, idx - 2);
  if (rxcrc != calcc) return false;
  respLen = idx;
  return true;
}

bool readU16(uint16_t addr, uint16_t &val) {
  uint8_t buf[32];
  size_t n = 0;
  if (!readHolding(SLAVE_ID, addr, 1, buf, n)) return false;
  val = (uint16_t)buf[3] << 8 | buf[4];
  return true;
}

// =====================
// WiFi
// =====================
void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected, IP: " + WiFi.localIP().toString());
}

// =====================
// Baca sensor RS485
// =====================
void readSoilOnce() {
  uint8_t buf[64];
  size_t nread = 0;
  if (readHolding(SLAVE_ID, 0x0000, 7, buf, nread)) {
    float moist = ((uint16_t)buf[3] << 8 | buf[4]) / 10.0;
    float ph = ((uint16_t)buf[9] << 8 | buf[10]) / 10.0;
    float ec = ((uint16_t)buf[7] << 8 | buf[8]) / 100.0;

    mois = moist;
    phTanah = ph;
    conduc = ec;

    Serial.printf("Sensor -> pH: %.2f, moisture: %.2f%%, EC: %.2f mS/cm\n", phTanah, mois, conduc);
  } else {
    Serial.println("Failed read soil sensor!");
  }
}

// =====================
// Kirim data ke server + ambil config
// =====================
bool postTelemetry() {
  if (WiFi.status() != WL_CONNECTED) connectWiFi();

  String payload = String("{\"deviceId\":\"") + DEVICE_ID + "\"," +
                   "\"ph\":" + String(phTanah, 2) + "," +
                   "\"moisture\":" + String(mois, 2) + "," +
                   "\"ec\":" + String(conduc, 2) + "," +
                   "\"water_pump_status\":\"" + (status_relayPin13 == NYALA ? "ON" : "OFF") + "\"," +
                   "\"nutrient_pump_status\":\"" + (status_relayPin14 == NYALA ? "ON" : "OFF") + "\"," +
                   "\"mode\":\"" + modeDevice + "\"}";

  Serial.println("Sending -> " + payload);

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.POST(payload);
  String resp = http.getString();

  Serial.print("POST code: ");
  Serial.println(httpCode);
  Serial.print("Response: ");
  Serial.println(resp);

  // Parsing sederhana: ambil status dari config
  if (httpCode == 200 && resp.indexOf("\"config\"") > 0) {
    if (resp.indexOf("\"water_pump_status\":\"ON\"") > 0)
      digitalWrite(relayPin13, NYALA);
    else
      digitalWrite(relayPin13, MATI);

    if (resp.indexOf("\"nutrient_pump_status\":\"ON\"") > 0)
      digitalWrite(relayPin14, NYALA);
    else
      digitalWrite(relayPin14, MATI);

    if (resp.indexOf("\"mode\":\"AUTO\"") > 0)
      modeDevice = "AUTO";
    else
      modeDevice = "MANUAL";

    Serial.println("Telemetry sent OK");
    http.end();
    return true;
  } else {
    Serial.println("Failed send or parse response.");
    http.end();
    return false;
  }
}

// =====================
// SETUP & LOOP
// =====================
void setup() {
  Serial.begin(115200);
  pinMode(relayPin13, OUTPUT);
  pinMode(relayPin14, OUTPUT);
  digitalWrite(relayPin13, MATI);
  digitalWrite(relayPin14, MATI);

  Serial2.begin(RS485_BAUD, SERIAL_8N1, RXD2, TXD2);
  connectWiFi();
  Serial.println("System Ready");
}

unsigned long lastSend = 0;
const unsigned long INTERVAL = 10000UL;

void loop() {
  if (millis() - lastSend >= INTERVAL) {
    lastSend = millis();
    readSoilOnce();
    postTelemetry();
    Serial.println();
  }
}
