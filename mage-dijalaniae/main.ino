#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>

#define PIN_TRIG 26
#define PIN_ECHO 27
#define PIN_BUZZER 25

#define RX1_PIN 9
#define TX1_PIN 10
#define RX2_PIN 16
#define TX2_PIN 17

const char apn[] = "internet"; 
const char gprsUser[] = "";
const char gprsPass[] = "";

const char server[] = "example.com";
const char resource[] = "/api/location";
const int port = 80;

const char emergencyNumber[] = "+628123456789";

HardwareSerial SerialGPS(1);
HardwareSerial SerialGSM(2);

TinyGsm modem(SerialGSM);
TinyGsmClient client(modem);
TinyGPSPlus gps;

unsigned long lastSendTime = 0;
const long sendInterval = 60000;
bool isBuzzerActive = false;
long obstacleDistance = 999;

void setup() {
  Serial.begin(115200);
  Serial.println("Sistem Smart Walking Stick Dimulai...");

  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  Serial.println("Pin I/O diatur.");

  SerialGPS.begin(9600, SERIAL_8N1, RX1_PIN, TX1_PIN);
  Serial.println("Serial GPS (UART 1) aktif.");

  SerialGSM.begin(9600, SERIAL_8N1, RX2_PIN, TX2_PIN);
  Serial.println("Serial GSM (UART 2) aktif.");

  Serial.println("Inisialisasi modem SIM800L...");
  if (!modem.init()) {
    Serial.println("Gagal inisialisasi modem, restart...");
    ESP.restart();
  }

  Serial.print("Menunggu jaringan...");
  if (!modem.waitForNetwork()) {
    Serial.println(" Gagal!");
  } else {
    Serial.println(" Terhubung ke jaringan!");
  }

  Serial.print("Menghubungkan ke GPRS...");
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println(" Gagal!");
  } else {
    Serial.println(" Berhasil terhubung GPRS!");
  }
}

void loop() {
  checkObstacle();
  readGPS();

  unsigned long currentTime = millis();
  if (currentTime - lastSendTime > sendInterval) {
    lastSendTime = currentTime; 
    Serial.println("\n--- Waktunya Mengirim Data ---");

    if (gps.location.isValid()) {
      handleDataTransmission();
    } else {
      Serial.println("Data GPS belum valid (mencari sinyal satelit)...");
    }
  }
}

void checkObstacle() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);

  long duration = pulseIn(PIN_ECHO, HIGH);
  obstacleDistance = (duration * 0.0343) / 2;

  Serial.print("Jarak Halangan: ");
  Serial.print(obstacleDistance);
  Serial.println(" cm");

  if (obstacleDistance < 100 && obstacleDistance > 0) {
    if (!isBuzzerActive) {
      tone(PIN_BUZZER, 1000);
      isBuzzerActive = true;
      Serial.println("!!! PERINGATAN: HALANGAN TERDETEKSI !!!");
    }
  } else {
    if (isBuzzerActive) {
      noTone(PIN_BUZZER);
      isBuzzerActive = false;
    }
  }

  delay(50);
}

void readGPS() {
  while (SerialGPS.available() > 0) {
    gps.encode(SerialGPS.read());
  }
}

void handleDataTransmission() {
  float lat = gps.location.lat();
  float lng = gps.location.lng();

  Serial.print("Lokasi Terbaca: Lat=");
  Serial.print(lat, 6);
  Serial.print(", Lng=");
  Serial.println(lng, 6);

  String payload = "{";
  payload += "\"lat\":" + String(lat, 6) + ",";
  payload += "\"lng\":" + String(lng, 6) + ",";
  payload += "\"obstacle\":" + String(isBuzzerActive ? "true" : "false");
  payload += "}";

  Serial.println("Payload: " + payload);

  if (sendDataToServer(payload)) {
    Serial.println("Data berhasil dikirim ke server.");
  } else {
    Serial.println("Gagal mengirim ke server. Mencoba kirim SMS darurat...");
    sendEmergencySMS(lat, lng);
  }
}

bool sendDataToServer(String payload) {
  if (!modem.isGprsConnected()) {
    Serial.print("Koneksi GPRS terputus. Menyambungkan ulang...");
    if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
      Serial.println(" Gagal.");
      return false;
    }
    Serial.println(" Tersambung.");
  }

  Serial.print("Menghubungkan ke server: ");
  Serial.print(server);
  Serial.print("...");

  if (!client.connect(server, port)) {
    Serial.println(" Gagal konek ke server.");
    return false;
  }
  Serial.println(" Terhubung!");

  Serial.println("Mengirim HTTP POST...");
  client.print(String("POST ") + resource + " HTTP/1.1\r\n");
  client.print(String("Host: ") + server + "\r\n");
  client.print("Connection: close\r\n");
  client.print("Content-Type: application/json\r\n");
  client.print(String("Content-Length: ") + payload.length() + "\r\n");
  client.print("\r\n");
  client.print(payload);

  unsigned long timeout = millis();
  while (client.connected() && millis() - timeout < 5000L) {
    while (client.available()) {
      char c = client.read();
      Serial.print(c);
      timeout = millis();
    }
  }
  Serial.println();

  client.stop();
  Serial.println("Koneksi server ditutup.");
  return true;
}

void sendEmergencySMS(float lat, float lng) {
  String smsMessage = "BANTUAN! Lokasi terakhir pengguna: \n";
  smsMessage += "http://maps.google.com/maps?q=";
  smsMessage += String(lat, 6);
  smsMessage += ",";
  smsMessage += String(lng, 6);

  Serial.print("Mengirim SMS ke: ");
  Serial.println(emergencyNumber);
  Serial.println("Isi: " + smsMessage);

  if (modem.sendSMS(emergencyNumber, smsMessage)) {
    Serial.println("SMS berhasil terkirim!");
  } else {
    Serial.println("Gagal mengirim SMS. Cek pulsa atau sinyal.");
  }
}