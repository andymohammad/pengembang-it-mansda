const socket = io();
const deviceId = document.body.dataset.deviceId;
const activeUserId = document.body.dataset.userId;
let isFiltered = false;
let currentWarningLogs = [];
let sensorChart, ewsHistoryChart;
if (!deviceId) {
  alert('Gagal memuat dashboard: ID Perangkat tidak ditemukan.');
} else if (!activeUserId) {
  alert('Gagal memuat dashboard: ID Pengguna tidak ditemukan.');
} else {
  // Bergabung ke room Socket.IO
  socket.emit('join-room', deviceId);
  console.log(`Bergabung ke room Socket: device_${deviceId}`);
}
// --- Referensi Elemen DOM ---
const elCurrentHr = document.getElementById('current-hr');
const elCurrentSpo2 = document.getElementById('current-spo2');
const elCurrentStatus = document.getElementById('current-status');
const elDeviceStatusBadge = document.getElementById('device-status-badge'); // Hanya ini yang kita perlukan untuk badge
const elHrTimestamp = document.getElementById('hr-timestamp');
const elSpo2Timestamp = document.getElementById('spo2-timestamp');
const elStatusTimestamp = document.getElementById('status-timestamp');
const elFilterStart = document.getElementById('filter-start');
const elFilterEnd = document.getElementById('filter-end');
const elFilterButton = document.getElementById('filter-button');
const elResetButton = document.getElementById('reset-button');
const elChartTitle = document.getElementById('chart-title');

const elStatAvgHr = document.getElementById('stat-avg-hr');
const elStatMaxHr = document.getElementById('stat-max-hr');
const elStatMinHr = document.getElementById('stat-min-hr');
const elStatAvgSpo2 = document.getElementById('stat-avg-spo2');
const elStatMinSpo2 = document.getElementById('stat-min-spo2');
const elStatAvgHrv = document.getElementById('stat-avg-hrv');
const elStatAvgSqi = document.getElementById('stat-avg-sqi');
const elStatEvents = document.getElementById('stat-events');

const elStatPeriodText = document.getElementById('stat-period-text');

// Ref DOM TAB Profile
const elProfileTab = document.getElementById('profile-tab');
const elRealtimeTab = document.getElementById('realtime-tab');
const elProfileForm = document.getElementById('profile-form');
const elSaveProfileBtn = document.getElementById('save-profile-btn');
const elProfileSaveStatus = document.getElementById('profile-save-status');

const elProfileAlertBadge = document.getElementById('profile-alert-badge');
const elProfileIncompleteAlert = document.getElementById('profile-incomplete-alert');
const elProfName = document.getElementById('prof-name');
const elProfDob = document.getElementById('prof-dob');
const elProfSex = document.getElementById('prof-sex');
const elProfHeight = document.getElementById('prof-height');
const elProfWeight = document.getElementById('prof-weight');
const elProfBlood = document.getElementById('prof-blood');
const elConditionsList = document.getElementById('conditions-checkbox-list');

const elPatientSummaryCard = document.getElementById('patient-summary-card');
const elPatientSummaryStandby = document.getElementById('patient-summary-standby');
const elPatientSummaryActive = document.getElementById('patient-summary-active');
const elStopSessionBtn = document.getElementById('stop-session-btn');

// Referensi untuk Modal Tautkan Pengguna
const elLinkUserButton = document.getElementById('link-user-button');
const elLinkUserModal = document.getElementById('linkUserModal');
const elExistingUserList = document.getElementById('existing-user-list');
const elNewUserForm = document.getElementById('new-user-form');
const elLinkExistingUserBtn = document.getElementById('link-existing-user-btn');
const elCreateAndLinkUserBtn = document.getElementById('create-and-link-user-btn');
const elModalGlobalStatus = document.getElementById('modal-global-status');
// Referensi untuk Tab di dalam Modal
const elLinkExistingTab = document.getElementById('link-existing-tab');
const elLinkNewTab = document.getElementById('link-new-tab');
const elCurrentHrv = document.getElementById('current-hrv');
const elCurrentSqi = document.getElementById('current-sqi');
const elHrvTimestamp = document.getElementById('hrv-timestamp');
const elSqiTimestamp = document.getElementById('sqi-timestamp');

// ==========================================================
// REFERENSI DOM - TAB 2 (EWS)
// ==========================================================
const elEwsTab = document.getElementById('ews-tab');
const elEwsScoreText = document.getElementById('ews-score-text');
const elEwsLabelText = document.getElementById('ews-label-text');
// const elEwsCard = document.getElementById('ews-card');
const elEwsTimestamp = document.getElementById('ews-timestamp');
const elEwsFilterStart = document.getElementById('ews-filter-start');
const elEwsFilterEnd = document.getElementById('ews-filter-end');
const elEwsFilterButton = document.getElementById('ews-filter-button');
const elEwsResetButton = document.getElementById('ews-reset-button');
const elWarningListModal = document.getElementById('warningListModal');
const elWarningListTableBody = document.getElementById('warning-list-table-body');
// --- INISIALISASI CHART.JS ---
const ctx = document.getElementById('sensorHistoryChart').getContext('2d');
const ctxEws = document.getElementById('ewsHistoryChart').getContext('2d');
const ctxEwsGauge = document.getElementById('ewsGaugeChart').getContext('2d');
const MAX_EWS_SCORE = 12;

const formatDataForChart = (logs) => {
  const labels = logs.map(log => new Date(log.timestamp));
  // Pisahkan data per perangkat (jika Anda mau, tapi untuk simpelnya kita gabung dulu)
  const hrData = logs.map(log => ({ x: new Date(log.timestamp), y: log.heart_rate }));
  const spo2Data = logs.map(log => ({ x: new Date(log.timestamp), y: log.spo2 }));
  return { labels, hrData, spo2Data };
};

// Ambil data awal dari EJS (sudah ada)
const safeInitialLogs = (typeof initialLogs !== 'undefined') ? initialLogs : [];
const initialData = formatDataForChart(safeInitialLogs);

sensorChart = new Chart(ctx, {
  type: 'line',
  data: {
    // 'labels' tidak lagi diperlukan jika 'x' ada di 'data'
    datasets: [
      {
        label: 'Detak Jantung (bpm)',
        data: initialData.hrData,
        borderColor: 'rgba(255, 99, 132, 1)',
        yAxisID: 'yHr',
      },
      {
        label: 'SpO2 (%)',
        data: initialData.spo2Data,
        borderColor: 'rgba(54, 162, 235, 1)',
        yAxisID: 'ySpo2',
      }
    ]
  },
  options: {
    responsive: true,
    // maintainAspectRatio: false,
    // aspectRatio: 1.0,
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          tooltipFormat: 'PPp', // Format tooltip waktu
        },
        title: { display: true, text: 'Waktu' }
      },
      yHr: { 
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Detak Jantung (bpm)',
          color: 'rgba(255, 99, 132, 1)' // Warna (Merah/Pink)
        },
        // Atur rentang skala agar stabil
        min: 40,  // Minimum HR (istirahat)
        max: 200, // Maksimum HR (aktivitas)
        ticks: {
          color: 'rgba(255, 99, 132, 1)' // Warna label
        },
        // Pastikan grid untuk sumbu ini terlihat
        grid: {
          drawOnChartArea: true, 
        }
        
      },
      ySpo2: { 
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'SpO2 (%)',
          color: 'rgba(54, 162, 235, 1)' // Warna (Biru/Cyan)
        },
        // "Zoom in" ke rentang klinis yang relevan
        min: 80,  // Min SpO2 (di bawah ini berbahaya)
        max: 100, // Max SpO2
        ticks: {
          color: 'rgba(54, 162, 235, 1)' // Warna label
        },
        // Matikan grid untuk sumbu kedua agar grafik tidak ramai
        grid: {
          drawOnChartArea: false, 
        }
        
      }
    }
  }
});


const ewsChart = new Chart(ctxEws, {
  type: 'line',
  data: {
    datasets: [{
      label: 'Skor EWS',
      data: [], // Awalnya kosong
      borderColor: 'rgba(255, 159, 64, 1)',
      backgroundColor: 'rgba(255, 159, 64, 0.2)',
      fill: true,
      stepped: true, // Membuat grafik terlihat "kotak" (bagus untuk skor)
    }]
  },
  options: {
    responsive: true,
    scales: {
      x: {
        type: 'time',
        time: { unit: 'hour', tooltipFormat: 'PPp' },
        title: { display: true, text: 'Waktu' }
      },
      y: {
        title: { display: true, text: 'Skor EWS' },
        min: 0,
        max: 12, // Sesuaikan max score Anda
        ticks: { stepSize: 1 }
      }
    }
  }
});

// Ambil skor awal dari EJS (disimpan di global 'deviceInfo')
const initialEwsScore = deviceInfo.ews_score || 0;
const initialEwsColor = getEwsColor(initialEwsScore);

const ewsGaugeChart = new Chart(ctxEwsGauge, {
  type: 'doughnut',
  data: {
    datasets: [{
      data: [initialEwsScore, MAX_EWS_SCORE - initialEwsScore],
      backgroundColor: [initialEwsColor, '#F0F0F0'], // Warna dinamis + Abu-abu
      borderColor: ['#FFFFFF', '#FFFFFF'],
      borderWidth: 2,
      circumference: 270, // 3/4 lingkaran (seperti gauge)
      rotation: -135, // Memulai dari kiri bawah
    }]
  },
  options: {
    responsive: true,
    aspectRatio: 1.5, // Menyesuaikan bentuk gauge
    cutout: '80%', // Ketebalan gauge
    plugins: {
      tooltip: { enabled: false }, // Matikan tooltip
      legend: { display: false } // Matikan legenda
    }
  }
});
function getEwsColor(score) {
  if (score <= 3) return '#28a745'; 
  if (score <= 6) return '#ffc107'; 
  return '#dc3545'; 
}
function updateEwsGauge(score) {
  if (score > MAX_EWS_SCORE) score = MAX_EWS_SCORE;
  
  const newColor = getEwsColor(score);
  const newLabel = (score <= 3) ? 'Risiko Rendah' : (score <= 6) ? 'Risiko Sedang' : 'Risiko Tinggi';
  
  // 1. Update Teks di Tengah
  if (elEwsScoreText) elEwsScoreText.textContent = score;
  if (elEwsLabelText) elEwsLabelText.textContent = newLabel;
  
  // 2. Update Data Chart
  if (ewsGaugeChart) {
    ewsGaugeChart.data.datasets[0].data = [score, MAX_EWS_SCORE - score];
    ewsGaugeChart.data.datasets[0].backgroundColor[0] = newColor;
    
    // 3. Update Chart tanpa animasi
    ewsGaugeChart.update('none');
  }
}

/**
* [HELPER BARU]
* Fungsi untuk memperbarui data di dalam grafik.
*/
function updateChart(logs) {
  const newData = formatDataForChart(logs);
  sensorChart.data.datasets[0].data = newData.hrData;
  sensorChart.data.datasets[1].data = newData.spo2Data;
  sensorChart.update();
}

/**
* [HELPER BARU]
* Fungsi untuk menambahkan satu data point ke grafik (Live Mode).
*/
function addDataToChart(data) {
  // Hanya tambahkan jika kita TIDAK dalam mode filter
  if (isFiltered) return;
  
  const newTime = new Date();
  sensorChart.data.datasets[0].data.push({ x: newTime, y: data.heart_rate });
  sensorChart.data.datasets[1].data.push({ x: newTime, y: data.spo2 });
  
  // Batasi jumlah data agar tidak terlalu berat
  const maxDataPoints = 100;
  if (sensorChart.data.datasets[0].data.length > maxDataPoints) {
    sensorChart.data.datasets[0].data.shift();
    sensorChart.data.datasets[1].data.shift();
  }
  sensorChart.update();
}

// [BARU] Fungsi untuk mengambil & memperbarui grafik EWS
async function fetchAndUpdateEwsChart(start, end) {
  try {
    const response = await fetch(`/api/ews-history?start=${start}&end=${end}&device_id=${deviceId}`);
    if (!response.ok) throw new Error('Gagal mengambil riwayat EWS');
    
    const ewsLogs = await response.json();
    
    // Format data untuk Chart.js
    const chartData = ewsLogs.map(log => ({
      x: new Date(log.timestamp),
      y: log.ews_score
    }));
    
    ewsChart.data.datasets[0].data = chartData;
    ewsChart.update();
    
  } catch (error) {
    console.error("Gagal memuat riwayat EWS:", error.message);
    alert('Gagal memuat riwayat EWS.');
  }
}

// [BARU] Helper untuk mendapatkan rentang waktu default (misal: 24 jam terakhir)
function getDefaultEwsTimeRange() {
  const end = new Date();
  const start = new Date(end.getTime() - (24 * 60 * 60 * 1000)); // 24 jam lalu
  return {
    start: start.toISOString().slice(0, 16).replace('T', ' '),
    end: end.toISOString().slice(0, 16).replace('T', ' ')
  };
}

function calculateStatistics(logs) {
  // Filter data yang tidak valid (HR=0 adalah error sensor, bukan data medis)
  const validLogs = logs.filter(log => log.heart_rate > 0 && log.spo2 > 0);
  currentWarningLogs = [];
  if (validLogs.length === 0) {
    // Kembalikan nilai default jika tidak ada data valid
    return {
      avgHr: '--', minHr: '--', maxHr: '--',
      avgSpo2: '--', minSpo2: '--',
      avgHrv: '--', avgSqi: '--',
      eventCount: 0
    };
  }
  
  let sumHr = 0, sumSpo2 = 0, sumHrv = 0, sumSqi = 0, eventCount = 0;
  let minHr = validLogs[0].heart_rate;
  let maxHr = validLogs[0].heart_rate;
  let minSpo2 = validLogs[0].spo2;
  
  validLogs.forEach(log => {
    // Kalkulasi HR
    sumHr += log.heart_rate;
    if (log.heart_rate < minHr) minHr = log.heart_rate;
    if (log.heart_rate > maxHr) maxHr = log.heart_rate;
    
    // Kalkulasi SpO2
    sumSpo2 += log.spo2;
    if (log.spo2 < minSpo2) minSpo2 = log.spo2;
    
    // Kalkulasi Data Inovasi
    sumHrv += log.hrv || 0;
    sumSqi += log.sqi || 0;
    
    // Hitung Kejadian/Peringatan
    if (log.status && log.status.toLowerCase() !== 'normal') {
      eventCount++;
      currentWarningLogs.push(log);
    }
  });
  
  const count = validLogs.length;
  return {
    avgHr: (sumHr / count).toFixed(1),
    minHr: minHr,
    maxHr: maxHr,
    avgSpo2: (sumSpo2 / count).toFixed(1),
    minSpo2: minSpo2,
    avgHrv: (sumHrv / count).toFixed(2),
    avgSqi: (sumSqi / count).toFixed(1),
    eventCount: eventCount
  };
}

/**
* Memperbarui UI panel statistik dengan data yang sudah dihitung.
*/
function updateStatisticsUI(stats, logs) {
  elStatAvgHr.textContent = `${stats.avgHr} bpm`;
  elStatMaxHr.textContent = `${stats.maxHr} bpm`;
  elStatMinHr.textContent = `${stats.minHr} bpm`;
  
  elStatAvgSpo2.textContent = `${stats.avgSpo2} %`;
  elStatMinSpo2.textContent = `${stats.minSpo2} %`;
  
  elStatAvgHrv.textContent = stats.avgHrv;
  elStatAvgSqi.textContent = `${stats.avgSqi} %`;
  elStatEvents.textContent = `${stats.eventCount} kejadian`;
  
  if (logs && logs.length > 0) {
    // console.log(logs);
    const startTime = new Date(logs[0].timestamp).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    const endTime = new Date(logs[logs.length - 1].timestamp).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    elStatPeriodText.textContent = `Periode: ${startTime} - ${endTime}`;
  } else {
    elStatPeriodText.textContent = 'Periode: Tidak ada data';
  }
}

function updateVitalCards(data) {
  // Variabel 'el...' ini harus didefinisikan di atas (di dalam DOMContentLoaded)
  if(elCurrentHr) elCurrentHr.textContent = data.heart_rate || '--';
  if(elCurrentSpo2) elCurrentSpo2.textContent = data.spo2 || '--';
  if(elCurrentStatus) elCurrentStatus.textContent = data.status || '--';
  if(elCurrentHrv) elCurrentHrv.textContent = data.hrv || '--';
  if(elCurrentSqi) elCurrentSqi.textContent = data.sqi || '--';
  
  // Perbarui timestamp untuk setiap kartu
  const time = new Date(data.timestamp).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  if(elHrTimestamp) elHrTimestamp.textContent = time;
  if(elSpo2Timestamp) elSpo2Timestamp.textContent = time;
  if(elStatusTimestamp) elStatusTimestamp.textContent = time;
  if(elHrvTimestamp) elHrvTimestamp.textContent = time;
  if(elSqiTimestamp) elSqiTimestamp.textContent = time;
}

function addDataToChart(data) {
  // 'isFiltered' dan 'sensorChart' adalah variabel global/luar
  if (isFiltered) return; // Jangan tambah jika sedang memfilter
  
  const newTime = new Date(data.timestamp);
  
  // Pastikan data valid sebelum di-push
  if (data.heart_rate) {
    sensorChart.data.datasets[0].data.push({ x: newTime, y: data.heart_rate });
  }
  if (data.spo2) {
    sensorChart.data.datasets[1].data.push({ x: newTime, y: data.spo2 });
  }
  
  // Batasi jumlah data di chart (misal 100 poin) agar performa tetap cepat
  while (sensorChart.data.datasets[0].data.length > 100) {
    sensorChart.data.datasets[0].data.shift();
  }
  while (sensorChart.data.datasets[1].data.length > 100) {
    sensorChart.data.datasets[1].data.shift();
  }
  
  // Update chart tanpa animasi agar mulus
  sensorChart.update('none');
}

function loadProfileData(user, userCons, allCons) {
  if (!elProfName || !elConditionsList) {
    console.warn('Elemen form profil tidak ditemukan.');
    return; 
  }
  
  // 1. Isi data biometrik
  elProfName.value = user.full_name || '';
  elProfDob.value = user.date_of_birth ? user.date_of_birth.split('T')[0] : ''; // Format YYYY-MM-DD
  elProfSex.value = user.sex || 'OTHER';
  elProfHeight.value = user.height || '';
  elProfWeight.value = user.weight || '';
  elProfBlood.value = user.blood_type || '';
  
  // 2. Cek kelengkapan profil & tampilkan peringatan
  const isIncomplete = !user.date_of_birth || !user.height || !user.weight;
  if (elProfileAlertBadge && elProfileIncompleteAlert) {
    if (isIncomplete) {
      elProfileAlertBadge.classList.remove('d-none');
      elProfileIncompleteAlert.classList.remove('d-none');
    } else {
      elProfileAlertBadge.classList.add('d-none');
      elProfileIncompleteAlert.classList.add('d-none');
    }
  }
  
  // 3. Buat daftar checkbox kondisi
  elConditionsList.innerHTML = ''; // Kosongkan daftar sebelumnya
  const userConditionSet = new Set(userCons); // Set untuk pencarian cepat
  
  if (allCons && allCons.length > 0) {
    allCons.forEach(condition => {
      const isChecked = userConditionSet.has(condition.id);
      const div = document.createElement('div');
      div.className = 'col-md-6';
      div.innerHTML = `
          <div class="form-check">
            <input class="form-check-input" type="checkbox" value="${condition.id}" id="cond-${condition.id}" ${isChecked ? 'checked' : ''}>
            <label class="form-check-label" for="cond-${condition.id}">
              ${condition.condition_name}
            </label>
          </div>
        `;
      elConditionsList.appendChild(div);
    });
  } else {
    elConditionsList.innerHTML = '<p class="text-muted">Tidak ada data kondisi medis di database.</p>';
  }
}
// --- LISTENER SOCKET.IO ---
// socket.on('session-started', (sessionData) => {
  //   console.log("Menerima Sesi Baru:", sessionData);
//   startSession(sessionData);
// });

// socket.on('session-stopped', () => {
  //   console.log("Sesi Dihentikan oleh Server.");
//   stopSession();
// });

socket.on('update-data', (data) => {
  console.log('Received real-time data:', data);
  // Hanya perbarui jika tidak ada sesi aktif ATAU jika data_user_id cocok dengan sesi aktif
  if (activeUserId === null || data.user_id !== activeUserId) {
    // Ini data "tanpa pemilik", mungkin hanya tampilkan di log
    console.warn("Menerima data untuk sesi yang tidak aktif/berbeda:", data);
    return;
  }
  // REVISI 1: Perbarui kartu atas
  elCurrentHr.textContent = data.heart_rate;
  elCurrentSpo2.textContent = data.spo2;
  elCurrentStatus.textContent = data.status || 'NORMAL';
  elCurrentHrv.textContent = data.hrv ? data.hrv.toFixed(1) : '--';
  elCurrentSqi.textContent = data.sqi ? data.sqi.toFixed(0) : '--';
  
  // Perbarui juga timestamp-nya
  const nowText = 'Baru Saja';
  elHrTimestamp.textContent = nowText;
  elSpo2Timestamp.textContent = nowText;
  elStatusTimestamp.textContent = nowText;
  
  // Tambahkan data baru ke grafik (jika tidak difilter)
  addDataToChart(data);
});

socket.on('new-log', (log) => {
  console.log('Received new log entry:', log);
  
});
socket.on('update-status', (data) => {
  console.log('Received status update:', data);
  
  // Kita hanya perlu memeriksa 'elDeviceStatusBadge'
  if (elDeviceStatusBadge) {
    // 1. Perbarui nama
    elDeviceStatusBadge.textContent = data.device_name;
    
    // 2. Hapus kelas warna lama
    elDeviceStatusBadge.classList.remove('bg-success', 'bg-danger', 'bg-secondary');
    
    // 3. Tambahkan kelas warna baru
    if (data.status.toLowerCase() === 'online') {
      elDeviceStatusBadge.classList.add('bg-success');
    } else {
      elDeviceStatusBadge.classList.add('bg-danger');
    }
  }
  
  if (data.status.toLowerCase() !== 'online') {
    elCurrentHr.textContent = '--';
    elCurrentSpo2.textContent = '--';
    elCurrentStatus.textContent = 'Perangkat Offline';
    elCurrentHrv.textContent = '--';
    elCurrentSqi.textContent = '--';
  }
});

socket.on('update-ews', (data) => {
  console.log('Received EWS update:', data);
  
  // [REVISI] Panggil helper gauge yang baru
  updateEwsGauge(data.ews_score);
  
  // Perbarui timestamp
  if (elEwsTimestamp) elEwsTimestamp.textContent = `Terakhir dihitung: Baru Saja`;
  
  // [Opsional] Tambahkan data ke grafik *riwayat* EWS secara real-time
  if (ewsChart) {
    const now = new Date();
    // Cek data terakhir agar tidak duplikat
    const lastData = ewsChart.data.datasets[0].data;
    if (lastData.length === 0 || lastData[lastData.length - 1].y !== data.ews_score) {
      ewsChart.data.datasets[0].data.push({ x: now, y: data.ews_score });
      ewsChart.update();
    }
  }
});

socket.on('invalid-data-toast', (data) => {
  console.warn(`[TOAST] Menerima data tidak valid: ${data.status_message}`);
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'warning',
    title: 'Peringatan Sensor',
    text: data.status_message,
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true
  });
});

elFilterButton.addEventListener('click', async () => {
  const start = elFilterStart.value;
  const end = elFilterEnd.value;
  
  if (!start || !end) {
    alert('Silakan pilih waktu mulai dan selesai.');
    return;
  }
  
  const startTime = start.replace('T', ' ');
  const endTime = end.replace('T', ' ');
  
  try {
    const response = await fetch(`/api/logs?start=${startTime}&end=${endTime}&device_id=${deviceId}`);
    
    if (!response.ok) {
      throw new Error('Gagal mengambil data dari server');
    }
    
    const filteredLogs = await response.json();
    
    updateChart(filteredLogs);
    const stats = calculateStatistics(filteredLogs);
    updateStatisticsUI(stats, filteredLogs);
    
    isFiltered = true;
    elChartTitle.textContent = `Riwayat Data (Difilter)`;
    
  } catch (error) {
    console.error('Error filtering data:', error);
    alert('Gagal memfilter data: ' + error.message);
  }
});

// 2. Klik Tombol Reset
elResetButton.addEventListener('click', () => {
  updateChart(safeInitialLogs);
  const stats = calculateStatistics(safeInitialLogs);
  updateStatisticsUI(stats, safeInitialLogs); // <-- Tambahkan 'safeInitialLogs'
  
  isFiltered = false;
  elChartTitle.textContent = `Riwayat Data (Log Terakhir)`;
  
  // Hapus nilai input filter
  elFilterStart.value = '';
  elFilterEnd.value = '';
});

elEwsTab.addEventListener('shown.bs.tab', () => {
  const { start, end } = getDefaultEwsTimeRange();
  // Set nilai default di input filter
  elEwsFilterStart.value = start.replace(' ', 'T');
  elEwsFilterEnd.value = end.replace(' ', 'T');
  fetchAndUpdateEwsChart(elEwsFilterStart, elEwsFilterEnd);
}, { once: true }); // {once: true} berarti ini hanya berjalan sekali

// Listener untuk tombol filter EWS
elEwsFilterButton.addEventListener('click', () => {
  const start = elEwsFilterStart.value.replace('T', ' ');
  const end = elEwsFilterEnd.value.replace('T', ' ');
  if (!start || !end) {
    alert('Silakan pilih waktu mulai dan selesai.');
    return;
  }
  fetchAndUpdateEwsChart(start, end);
});

// Listener untuk tombol reset EWS
elEwsResetButton.addEventListener('click', () => {
  const { start, end } = getDefaultEwsTimeRange();
  elEwsFilterStart.value = start.replace(' ', 'T');
  elEwsFilterEnd.value = end.replace(' ', 'T');
  fetchAndUpdateEwsChart(start, end);
});

const initialStats = calculateStatistics(safeInitialLogs);
updateStatisticsUI(initialStats, safeInitialLogs);


function setInitialEwsCard() {
  const score = deviceInfo.ews_score || 0;
  elEwsScoreText.textContent = score;
  if (score <= 3) elEwsLabelText.textContent = 'Risiko Rendah';
  else if (score <= 6) elEwsLabelText.textContent = 'Risiko Sedang';
  else elEwsLabelText.textContent = 'Risiko Tinggi';
}
// setInitialEwsCard();
updateEwsGauge(initialEwsScore);
// Logic Profil tab
if (elProfileForm) {
  elProfileForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Hentikan submit HTML biasa
    
    // Tampilkan status loading
    elSaveProfileBtn.disabled = true;
    elSaveProfileBtn.textContent = 'Menyimpan...';
    elProfileSaveStatus.textContent = '';
    
    try {
      // Kumpulkan semua data dari formulir
      const userId = elProfileForm.dataset.userId;
      const data = {
        userId: parseInt(userId),
        full_name: document.getElementById('prof-name').value,
        date_of_birth: document.getElementById('prof-dob').value,
        biological_sex: document.getElementById('prof-sex').value,
        height_cm: parseInt(document.getElementById('prof-height').value),
        weight_kg: parseFloat(document.getElementById('prof-weight').value),
        blood_type: document.getElementById('prof-blood').value,
        conditions: [] // Siapkan array untuk ID kondisi
      };
      
      // Kumpulkan semua checkbox kondisi yang dicentang
      document.querySelectorAll('.condition-checkbox:checked').forEach(checkbox => {
        data.conditions.push(parseInt(checkbox.value));
      });
      
      // Kirim ke backend API
      const response = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Gagal menyimpan');
      }
      
      // Tampilkan pesan sukses
      elProfileSaveStatus.textContent = '✅ Profil berhasil diperbarui!';
      elProfileSaveStatus.className = 'text-success ms-3 d-inline';
      
      // Opsional: Muat ulang halaman setelah 2 detik untuk melihat perubahan
      setTimeout(() => window.location.reload(), 2000);
      
    } catch (error) {
      console.error('Gagal menyimpan profil:', error);
      elProfileSaveStatus.textContent = `❌ Error: ${error.message}`;
      elProfileSaveStatus.className = 'text-danger ms-3 d-inline';
    } finally {
      // Kembalikan tombol ke status normal
      elSaveProfileBtn.disabled = false;
      elSaveProfileBtn.textContent = 'Simpan Profil';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  
  
  // --- LOGIKA UTAMA PERMINTAAN ANDA ---
  // (isProfileIncomplete didapat dari tag <script> di EJS)
  if (isProfileIncomplete && elProfileTab) {
    console.log("Profil tidak lengkap, mengarahkan ke tab Profil Kesehatan...");
    
    // Non-aktifkan tab lain
    document.getElementById('realtime-tab').classList.remove('active');
    document.getElementById('realtime-content').classList.remove('show', 'active');
    document.getElementById('ews-tab').classList.remove('active');
    document.getElementById('ews-content').classList.remove('show', 'active');
    
    // Aktifkan tab profil
    elProfileTab.classList.add('active');
    document.getElementById('profile-content').classList.add('show', 'active');
    
    // Beri tahu Bootstrap (meskipun ini seharusnya sudah cukup)
    // const tab = new bootstrap.Tab(elProfileTab);
    // tab.show();
  } else {
    // Jika profil LENGKAP, buka tab real-time secara default
    document.getElementById('realtime-tab').classList.add('active');
    document.getElementById('realtime-content').classList.add('show', 'active');
  }
  
  // (Pindahkan kode 'initialStats' Anda ke sini agar aman)
  if (typeof calculateStatistics === 'function') {
    const initialStats = calculateStatistics(safeInitialLogs);
    updateStatisticsUI(initialStats, safeInitialLogs);
  }
  
  // (Pindahkan kode 'setInitialEwsCard' Anda ke sini)
  if (typeof setInitialEwsCard === 'function') {
    setInitialEwsCard();
  }
  
  if (typeof initialLogs !== 'undefined') {
    const stats = calculateStatistics(initialLogs);
    updateStatisticsUI(stats, initialLogs);
    updateChart(initialLogs);
  }
  
  if (typeof currentUser !== 'undefined') {
    updateEwsGauge(currentUser.ews_score || 0);
    if (typeof allConditions !== 'undefined' && typeof userConditions !== 'undefined') {
      loadProfileData(currentUser, userConditions, allConditions);
    }
  }
});

async function loadExistingUsers() {
  elExistingUserList.innerHTML = '<li class="list-group-item">Memuat...</li>';
  selectedUserId = null; // Reset pilihan
  try {
    const response = await fetch('/api/users');
    if (!response.ok) throw new Error('Gagal mengambil daftar pengguna');
    const users = await response.json();
    
    elExistingUserList.innerHTML = ''; // Kosongkan daftar
    if (users.length === 0) {
      elExistingUserList.innerHTML = '<li class="list-group-item">Tidak ada pengguna terdaftar.</li>';
      return;
    }
    
    users.forEach(user => {
      const li = document.createElement('li');
      li.className = 'list-group-item list-group-item-action'; // 'list-group-item-action' agar bisa diklik
      li.textContent = `${user.full_name} (Lahir: ${user.date_of_birth})`;
      li.dataset.userId = user.id; // Simpan ID di atribut data
      elExistingUserList.appendChild(li);
    });
    
  } catch (error) {
    console.error(error);
    elExistingUserList.innerHTML = `<li class="list-group-item list-group-item-danger">${error.message}</li>`;
  }
}

// [BARU] Listener untuk tombol pemicu modal
if (elLinkUserButton) {
  elLinkUserButton.addEventListener('click', () => {
    // Saat modal dibuka, langsung muat daftar pengguna
    loadExistingUsers();
    // Pastikan tab pertama yang aktif
    elLinkExistingTab.click();
    elModalGlobalStatus.textContent = '';
  });
}

// [BARU] Listener untuk daftar pengguna (memilih pengguna)
if (elExistingUserList) {
  elExistingUserList.addEventListener('click', (e) => {
    // Cek jika yang diklik adalah 'LI'
    if (e.target && e.target.tagName === 'LI' && e.target.dataset.userId) {
      // Hapus 'active' dari semua item
      elExistingUserList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
      // Tambahkan 'active' ke item yang diklik
      e.target.classList.add('active');
      // Simpan ID pengguna yang dipilih
      selectedUserId = e.target.dataset.userId;
      elModalGlobalStatus.textContent = '';
    }
  });
}

// [BARU] Listener untuk tombol "Tautkan Pengguna" (dari tab 'Pilih')
if (elLinkExistingUserBtn) {
  elLinkExistingUserBtn.addEventListener('click', async () => {
    if (!selectedUserId) {
      elModalGlobalStatus.textContent = 'Silakan pilih pengguna dari daftar.';
      elModalGlobalStatus.className = 'text-danger me-auto';
      return;
    }
    
    elLinkExistingUserBtn.disabled = true;
    elModalGlobalStatus.textContent = 'Menautkan...';
    
    try {
      await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId, userId: selectedUserId })
      });
      // const response = await fetch('/api/devices/link-user', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ deviceId: deviceId, userId: selectedUserId })
      // });
      // const result = await response.json();
      // if (!response.ok) throw new Error(result.error);
      
      // elModalGlobalStatus.textContent = 'Berhasil ditautkan! Memuat ulang...';
      // elModalGlobalStatus.className = 'text-success me-auto';
      // setTimeout(() => window.location.reload(), 1500);
      
    } catch (error) {
      elModalGlobalStatus.textContent = `Error: ${error.message}`;
      elModalGlobalStatus.className = 'text-danger me-auto';
      elLinkExistingUserBtn.disabled = false;
    }
  });
}

// [BARU] Listener untuk form "Tambah Pengguna Baru"
if (elNewUserForm) {
  elNewUserForm.addEventListener('submit', async (e) => {
    e.preventDefault(); // Hentikan submit form
    
    const statusEl = document.getElementById('create-new-user-status');
    elCreateAndLinkUserBtn.disabled = true;
    statusEl.textContent = 'Membuat pengguna...';
    
    try {
      // Kumpulkan data form
      const data = {
        deviceId: deviceId,
        fullName: document.getElementById('new-user-name').value,
        dateOfBirth: document.getElementById('new-user-dob').value,
        biologicalSex: document.getElementById('new-user-sex').value
      };
      
      const response = await fetch('/api/users/create-and-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      
      statusEl.textContent = 'Berhasil dibuat & ditautkan! Memuat ulang...';
      statusEl.className = 'text-success';
      await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId, userId: selectedUserId })
      });
      // setTimeout(() => window.location.reload(), 1500);
      
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'text-danger';
      elCreateAndLinkUserBtn.disabled = false;
    }
  });
}

if (elStopSessionBtn) {
  elStopSessionBtn.addEventListener('click', async () => {
    if (confirm('Apakah Anda yakin ingin menghentikan sesi pasien ini?')) {
      elStopSessionBtn.disabled = true;
      elStopSessionBtn.textContent = 'Menghentikan...';
      try {
        await fetch('/api/session/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: deviceId })
        });
        
        // SUKSES: Arahkan kembali ke halaman penautan
        alert('Sesi dihentikan. Anda akan dikembalikan ke halaman penautan perangkat.');
        window.location.href = `/link-device/${deviceId}`; // <-- Arahkan!
        
      } catch (err) {
        alert('Gagal menghentikan sesi. Periksa koneksi.');
        elStopSessionBtn.disabled = false;
        elStopSessionBtn.innerHTML = '<i class="fa-solid fa-stop-circle me-2"></i>Hentikan Sesi';
      }
    }
  });
}

// [BARU] Logika untuk menampilkan tombol simpan yang benar di modal
if (elLinkUserModal) {
  elLinkExistingTab.addEventListener('click', () => {
    elLinkExistingUserBtn.classList.remove('d-none');
    elCreateAndLinkUserBtn.classList.add('d-none');
  });
  elLinkNewTab.addEventListener('click', () => {
    elLinkExistingUserBtn.classList.add('d-none');
    elCreateAndLinkUserBtn.classList.remove('d-none');
  });
}

if (elWarningListModal) {
  elWarningListModal.addEventListener('show.bs.modal', () => {
    if (!elWarningListTableBody) return; // Pengaman
    
    elWarningListTableBody.innerHTML = ''; // Kosongkan daftar lama
    
    if (currentWarningLogs.length === 0) {
      elWarningListTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Tidak ada peringatan pada periode ini.</td></tr>';
      return;
    }
    
    // Urutkan dari yang terbaru (array sudah di-push, jadi kita reverse)
    // Sebenarnya, 'currentWarningLogs' sudah urut menaik, kita urutkan menurun
    const sortedLogs = [...currentWarningLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Isi tabel
    sortedLogs.forEach(log => {
      const tr = document.createElement('tr');
      const timestamp = new Date(log.timestamp).toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      
      tr.innerHTML = `
        <td>${timestamp}</td>
        <td>${log.heart_rate} bpm</td>
        <td>${log.spo2} %</td>
        <td class="text-danger fw-bold">${log.status}</td>
      `;
      elWarningListTableBody.appendChild(tr);
    });
  });
}