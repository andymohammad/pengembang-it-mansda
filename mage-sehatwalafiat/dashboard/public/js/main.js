const socket = io();
const deviceId = document.body.dataset.deviceId;
if (!deviceId) {
  console.error('KRITIS: deviceId tidak ditemukan di body!');
  alert('Gagal memuat dashboard: ID Perangkat tidak ditemukan.');
} else {
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
let selectedUserId = null;
let isFiltered = false;

// ==========================================================
// REFERENSI DOM - TAB 2 (EWS)
// ==========================================================
const elEwsTab = document.getElementById('ews-tab');
const elEwsScoreText = document.getElementById('ews-score-text');
const elEwsLabelText = document.getElementById('ews-label-text');
const elEwsCard = document.getElementById('ews-card');
const elEwsTimestamp = document.getElementById('ews-timestamp');
const elEwsFilterStart = document.getElementById('ews-filter-start');
const elEwsFilterEnd = document.getElementById('ews-filter-end');
const elEwsFilterButton = document.getElementById('ews-filter-button');
const elEwsResetButton = document.getElementById('ews-reset-button');

// --- INISIALISASI CHART.JS ---
const ctx = document.getElementById('sensorHistoryChart').getContext('2d');
const ctxEws = document.getElementById('ewsHistoryChart').getContext('2d');
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

const sensorChart = new Chart(ctx, {
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
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'minute',
          tooltipFormat: 'PPp', // Format tooltip waktu
        },
        title: { display: true, text: 'Waktu' }
      },
      yHr: { /* ... (opsi yHr Anda) ... */ },
      ySpo2: { /* ... (opsi ySpo2 Anda) ... */ }
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
    console.log(logs);
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

// --- LISTENER SOCKET.IO ---

// 1. Menerima data real-time dari MQTT
socket.on('update-data', (data) => {
  console.log('Received real-time data:', data);
  
  // REVISI 1: Perbarui kartu atas
  elCurrentHr.textContent = data.heart_rate;
  elCurrentSpo2.textContent = data.spo2;
  elCurrentStatus.textContent = data.status || 'NORMAL';

  // Perbarui juga timestamp-nya
  const nowText = 'Baru Saja';
  elHrTimestamp.textContent = nowText;
  elSpo2Timestamp.textContent = nowText;
  elStatusTimestamp.textContent = nowText;

  // Tambahkan data baru ke grafik (jika tidak difilter)
  addDataToChart(data);
});
// 2. Menerima data log baru dari HTTP POST
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
});

socket.on('update-ews', (data) => {
  console.log('Received EWS update:', data);
  if (elEwsScoreText) {
    const score = data.ews_score;
    elEwsScoreText.textContent = score;
    elEwsTimestamp.textContent = `Terakhir dihitung: Baru Saja`;
    
    // Perbarui warna kartu & label
    elEwsCard.classList.remove('bg-success-subtle', 'bg-warning-subtle', 'bg-danger-subtle', 'bg-light');
    
    if (score <= 3) {
      elEwsLabelText.textContent = 'Risiko Rendah';
      elEwsCard.classList.add('bg-success-subtle'); // (Bootstrap class)
    } else if (score <= 6) {
      elEwsLabelText.textContent = 'Risiko Sedang';
      elEwsCard.classList.add('bg-warning-subtle'); // (Bootstrap class)
    } else {
      elEwsLabelText.textContent = 'Risiko Tinggi';
      elEwsCard.classList.add('bg-danger-subtle'); // (Bootstrap class)
    }
  }
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
  // Muat grafik
  fetchAndUpdateEwsChart(start, end);
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
setInitialEwsCard();

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
  // (Pindahkan kode 'initialStats' Anda ke sini agar aman)
  if (typeof calculateStatistics === 'function') {
    const initialStats = calculateStatistics(safeInitialLogs);
    updateStatisticsUI(initialStats, safeInitialLogs);
  }
  
  // (Pindahkan kode 'setInitialEwsCard' Anda ke sini)
  if (typeof setInitialEwsCard === 'function') {
    setInitialEwsCard();
  }

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
      const response = await fetch('/api/devices/link-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId, userId: selectedUserId })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      
      elModalGlobalStatus.textContent = 'Berhasil ditautkan! Memuat ulang...';
      elModalGlobalStatus.className = 'text-success me-auto';
      setTimeout(() => window.location.reload(), 1500);

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
      setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.className = 'text-danger';
      elCreateAndLinkUserBtn.disabled = false;
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