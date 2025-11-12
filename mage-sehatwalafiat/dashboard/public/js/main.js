/*
 * main.js (Arsitektur Dasbor Pribadi Sederhana)
 * - Menghapus startSession, stopSession, fetch /api/session/status
 * - Mengambil activeUserId langsung dari body tag
 * - Mengasumsikan semua elemen HTML ada
 * - Menggunakan config chart default (sebelum revisi aspectRatio)
 */

// --- VARIABEL GLOBAL ---
const socket = io();
const deviceId = document.body.dataset.deviceId;
const activeUserId = document.body.dataset.userId; // <-- Diambil langsung
let isFiltered = false;
let currentWarningLogs = [];
let sensorChart, ewsGaugeChart, ewsHistoryChart;

if (!deviceId || !activeUserId) {
  console.error('KRITIS: deviceId atau userId tidak ditemukan di body!');
  alert('Gagal memuat dashboard: Data perangkat/pengguna tidak lengkap.');
} else {
  // Bergabung ke room Socket.IO
  socket.emit('join-room', deviceId);
  console.log(`Bergabung ke room Socket: device_${deviceId} untuk User: ${activeUserId}`);
}

// --- LISTENER SOCKET.IO ---

socket.on('update-data', (data) => {
  console.log('Received real-time data:', data);

  // Cek sederhana: Apakah data ini untuk pengguna yang sedang kita pantau?
  if (data.user_id !== parseInt(activeUserId)) {
    console.warn(`Data diterima untuk user ${data.user_id}, tapi sesi aktif adalah ${activeUserId}. Diabaikan.`);
    return;
  }
  
  // Panggil fungsi untuk update kartu vital
  updateVitalCards(data);

  // Tambah ke chart (jika live)
  addDataToChart(data);
  
  // (Opsional) Perbarui EWS secara real-time jika ada
  // if (data.ews_score) {
  //   updateEwsGauge(data.ews_score);
  // }
});

socket.on('update-status', (data) => {
  if (data.deviceId.toString() !== deviceId) return;
  
  const elDeviceStatusBadge = document.getElementById('device-status-badge');
  const elDeviceStatusIcon = document.getElementById('device-status-icon');
  
  const isOnline = data.status === 'online';
  const statusClass = isOnline ? 'bg-success' : 'bg-danger';
  const iconClass = isOnline ? 'fa-circle-check' : 'fa-circle-xmark';
  
  if (elDeviceStatusBadge) elDeviceStatusBadge.className = `badge fs-6 ${statusClass}`;
  if (elDeviceStatusIcon) elDeviceStatusIcon.className = `fa-solid ${iconClass} me-2`;
});

socket.on('invalid-data-toast', (data) => {
  Swal.fire({
    toast: true, position: 'top-end',
    icon: 'warning', title: data.message,
    showConfirmButton: false, timer: 3000
  });
});

// ==========================================================
// LOGIKA UTAMA SAAT HALAMAN DIMUAT
// ==========================================================
document.addEventListener('DOMContentLoaded', () => {

  // --- 1. DEKLARASI REFERENSI DOM ---
  // (Semua elemen dijamin ada oleh server.js)
  const elCurrentHr = document.getElementById('current-hr');
  const elCurrentSpo2 = document.getElementById('current-spo2');
  const elCurrentStatus = document.getElementById('current-status');
  const elCurrentHrv = document.getElementById('current-hrv');
  const elCurrentSqi = document.getElementById('current-sqi');
  
  const elHrTimestamp = document.getElementById('hr-timestamp');
  const elSpo2Timestamp = document.getElementById('spo2-timestamp');
  const elStatusTimestamp = document.getElementById('status-timestamp');
  const elHrvTimestamp = document.getElementById('hrv-timestamp');
  const elSqiTimestamp = document.getElementById('sqi-timestamp');

  const elFilterStart = document.getElementById('filter-start');
  const elFilterEnd = document.getElementById('filter-end');
  const elFilterButton = document.getElementById('filter-button');
  const elResetButton = document.getElementById('reset-button');
  const elChartTitle = document.getElementById('chart-title');
  const elStatPeriodText = document.getElementById('stat-period-text');
  
  const elStatAvgHr = document.getElementById('stat-avg-hr');
  const elStatMaxHr = document.getElementById('stat-max-hr');
  const elStatMinHr = document.getElementById('stat-min-hr');
  const elStatAvgSpo2 = document.getElementById('stat-avg-spo2');
  const elStatMinSpo2 = document.getElementById('stat-min-spo2');
  const elStatEvents = document.getElementById('stat-events');
  // (Tambahkan elStatAvgHrv dan elStatAvgSqi jika ada)

  const elProfileForm = document.getElementById('profile-form');
  const elWarningListModal = document.getElementById('warningListModal');
  const elWarningListTableBody = document.getElementById('warning-list-table-body');
  
  const elEwsScoreText = document.getElementById('ews-score-text');
  const elEwsLabelText = document.getElementById('ews-label-text');
  const elEwsTimestamp = document.getElementById('ews-timestamp');
  
  const elProfileAlertBadge = document.getElementById('profile-alert-badge');
  const elProfileIncompleteAlert = document.getElementById('profile-incomplete-alert');
  
  const elProfName = document.getElementById('prof-name');
  const elProfDob = document.getElementById('prof-dob');
  const elProfSex = document.getElementById('prof-sex');
  const elProfHeight = document.getElementById('prof-height');
  const elProfWeight = document.getElementById('prof-weight');
  const elProfBlood = document.getElementById('prof-blood');
  const elConditionsList = document.getElementById('conditions-checkbox-list');
  const elProfileSaveStatus = document.getElementById('profile-save-status');


  // --- 2. INISIALISASI CHART ---
  // (Config SEBELUM revisi aspectRatio)
  const ctxSensorHistory = document.getElementById('sensorHistoryChart').getContext('2d');
  sensorChart = new Chart(ctxSensorHistory, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Detak Jantung (bpm)',
          borderColor: 'rgba(255, 99, 132, 1)',
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          yAxisID: 'yHr',
          data: [],
        },
        {
          label: 'SpO2 (%)',
          borderColor: 'rgba(54, 162, 235, 1)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          yAxisID: 'ySpo2',
          data: [],
        }
      ]
    },
    options: {
      responsive: true,
      // maintainAspectRatio: true (Ini adalah default)
      scales: {
        x: {
          type: 'time',
          time: { unit: 'minute', tooltipFormat: 'PPp' },
          title: { display: true, text: 'Waktu' }
        },
        yHr: { // Sumbu Y Kiri
          type: 'linear', display: true, position: 'left',
          title: { display: true, text: 'Detak Jantung (bpm)', color: 'rgba(255, 99, 132, 1)' },
          min: 40, max: 200,
          ticks: { color: 'rgba(255, 99, 132, 1)' }
        },
        ySpo2: { // Sumbu Y Kanan
          type: 'linear', display: true, position: 'right',
          title: { display: true, text: 'SpO2 (%)', color: 'rgba(54, 162, 235, 1)' },
          min: 80, max: 100,
          ticks: { color: 'rgba(54, 162, 235, 1)' },
          grid: { drawOnChartArea: false } // Agar tidak terlalu ramai
        }
      }
    }
  });

  const ctxEwsGauge = document.getElementById('ewsGaugeChart').getContext('2d');
  ewsGaugeChart = new Chart(ctxEwsGauge, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [currentUser.ews_score || 0, Math.max(0, 10 - (currentUser.ews_score || 0))],
        backgroundColor: [getEwsColor(currentUser.ews_score || 0), '#e9ecef'],
        borderWidth: 0
      }]
    },
    options: {
      rotation: -90, circumference: 180, cutout: '70%',
      responsive: true, plugins: { tooltip: { enabled: false } }
    }
  });


  // --- 3. DEFINISI FUNGSI LOKAL ---

  function getEwsColor(score) {
    if (score <= 3) return '#28a745'; // Hijau
    if (score <= 6) return '#ffc107'; // Kuning
    return '#dc3545'; // Merah
  }

  function updateChart(logs) {
    const newData = formatDataForChart(logs);
    sensorChart.data.datasets[0].data = newData.hrData;
    sensorChart.data.datasets[1].data = newData.spo2Data;
    sensorChart.update();
  }
  
  function addDataToChart(data) {
    if (isFiltered) return; // Jangan tambah jika sedang memfilter
    
    const newTime = new Date(data.timestamp);
    sensorChart.data.datasets[0].data.push({ x: newTime, y: data.heart_rate });
    sensorChart.data.datasets[1].data.push({ x: newTime, y: data.spo2 });
    
    // Batasi jumlah data di chart agar tidak lemot
    while (sensorChart.data.datasets[0].data.length > 100) {
      sensorChart.data.datasets[0].data.shift();
      sensorChart.data.datasets[1].data.shift();
    }
    sensorChart.update();
  }

  function formatDataForChart(logs) {
    const hrData = [];
    const spo2Data = [];
    logs.forEach(log => {
      const time = new Date(log.timestamp);
      if (log.heart_rate) hrData.push({ x: time, y: log.heart_rate });
      if (log.spo2) spo2Data.push({ x: time, y: log.spo2 });
    });
    return { hrData, spo2Data };
  }
  
  function calculateStatistics(logs) {
    let hrSum = 0, hrCount = 0, maxHr = -Infinity, minHr = Infinity;
    let spo2Sum = 0, spo2Count = 0, minSpo2 = Infinity;
    let eventCount = 0;
    
    currentWarningLogs = []; // Reset daftar peringatan

    logs.forEach(log => {
      if (log.heart_rate) {
        hrSum += log.heart_rate;
        hrCount++;
        if (log.heart_rate > maxHr) maxHr = log.heart_rate;
        if (log.heart_rate < minHr) minHr = log.heart_rate;
      }
      if (log.spo2) {
        spo2Sum += log.spo2;
        spo2Count++;
        if (log.spo2 < minSpo2) minSpo2 = log.spo2;
      }
      if (log.status && log.status !== 'NORMAL') {
        eventCount++;
        currentWarningLogs.push(log); // Simpan log untuk modal
      }
    });

    return {
      avgHr: hrCount ? (hrSum / hrCount).toFixed(1) : '--',
      maxHr: maxHr === -Infinity ? '--' : maxHr,
      minHr: minHr === Infinity ? '--' : minHr,
      avgSpo2: spo2Count ? (spo2Sum / spo2Count).toFixed(1) : '--',
      minSpo2: minSpo2 === Infinity ? '--' : minSpo2,
      eventCount: eventCount
    };
  }
  
  function updateStatisticsUI(stats, logs) {
    elStatAvgHr.textContent = `${stats.avgHr} bpm`;
    elStatMaxHr.textContent = `${stats.maxHr} bpm`;
    elStatMinHr.textContent = `${stats.minHr} bpm`;
    elStatAvgSpo2.textContent = `${stats.avgSpo2} %`;
    elStatMinSpo2.textContent = `${stats.minSpo2} %`;
    elStatEvents.textContent = `${stats.eventCount} kejadian`;
    
    if (logs.length > 0) {
      const start = new Date(logs[0].timestamp).toLocaleString('id-ID');
      const end = new Date(logs[logs.length - 1].timestamp).toLocaleString('id-ID');
      elStatPeriodText.textContent = `Periode: ${start} - ${end}`;
    } else {
      elStatPeriodText.textContent = `Periode: --`;
    }
  }

  function updateEwsGauge(score) {
    if (score > 10) score = 10;
    
    let label = "Risiko Rendah";
    let color = getEwsColor(score);
    if (score > 3 && score <= 6) {
      label = "Risiko Sedang";
    } else if (score > 6) {
      label = "Risiko Tinggi";
    }

    elEwsScoreText.textContent = score;
    elEwsLabelText.textContent = label;
    elEwsLabelText.style.color = color;
    elEwsScoreText.style.color = color;
    elEwsTimestamp.textContent = `Diperbarui: ${new Date().toLocaleTimeString('id-ID')}`;
    
    ewsGaugeChart.data.datasets[0].data[0] = score;
    ewsGaugeChart.data.datasets[0].data[1] = Math.max(0, 10 - score);
    ewsGaugeChart.data.datasets[0].backgroundColor[0] = color;
    ewsGaugeChart.update();
  }
  
  function updateVitalCards(data) {
    elCurrentHr.textContent = data.heart_rate || '--';
    elCurrentSpo2.textContent = data.spo2 || '--';
    elCurrentStatus.textContent = data.status || '--';
    elCurrentHrv.textContent = data.hrv || '--';
    elCurrentSqi.textContent = data.sqi || '--';
    
    const time = new Date(data.timestamp).toLocaleTimeString('id-ID');
    elHrTimestamp.textContent = time;
    elSpo2Timestamp.textContent = time;
    elStatusTimestamp.textContent = time;
    elHrvTimestamp.textContent = time;
    elSqiTimestamp.textContent = time;
  }
  
  function loadProfileData(user, userCons, allCons) {
    // Isi form profil dengan data dari server
    elProfName.value = user.full_name || '';
    elProfDob.value = user.date_of_birth ? user.date_of_birth.split('T')[0] : '';
    elProfSex.value = user.sex || 'OTHER';
    elProfHeight.value = user.height || '';
    elProfWeight.value = user.weight || '';
    elProfBlood.value = user.blood_type || '';
    
    // Buat daftar checkbox untuk kondisi
    elConditionsList.innerHTML = '';
    const userConditionSet = new Set(userCons);
    
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
  }

  
  // --- 4. LISTENER EVENT (Tombol, Form, Modal) ---

  // Tombol Filter
  if (elFilterButton) {
    elFilterButton.addEventListener('click', async () => {
      const start = elFilterStart.value;
      const end = elFilterEnd.value;
      if (!start || !end) return alert('Harap tentukan waktu mulai dan selesai.');
      
      try {
        const response = await fetch(`/api/logs/${deviceId}?start=${start}&end=${end}&userId=${activeUserId}`);
        const logs = await response.json();
        
        isFiltered = true;
        elChartTitle.textContent = `Riwayat Data (Filter)`;
        updateChart(logs);
        const stats = calculateStatistics(logs);
        updateStatisticsUI(stats, logs);
        
      } catch (err) {
        alert('Gagal mengambil data filter.');
      }
    });
  }
  
  // Tombol Reset Filter
  if (elResetButton) {
    elResetButton.addEventListener('click', async () => {
      try {
        const response = await fetch(`/api/logs/latest/${deviceId}?userId=${activeUserId}`);
        const logs = await response.json();
        
        isFiltered = false;
        elChartTitle.textContent = `Riwayat Data (Log Terakhir)`;
        elFilterStart.value = '';
        elFilterEnd.value = '';
        updateChart(logs);
        const stats = calculateStatistics(logs);
        updateStatisticsUI(stats, logs);
        
      } catch (err) {
        alert('Gagal mereset data.');
      }
    });
  }

  // Modal Daftar Peringatan
  if (elWarningListModal) {
    elWarningListModal.addEventListener('show.bs.modal', () => {
      elWarningListTableBody.innerHTML = ''; // Kosongkan
      
      if (currentWarningLogs.length === 0) {
        elWarningListTableBody.innerHTML = '<tr><td colspan="4" class="text-center">Tidak ada peringatan pada periode ini.</td></tr>';
        return;
      }
      
      // Urutkan dari yang terbaru
      const sortedLogs = [...currentWarningLogs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      sortedLogs.forEach(log => {
        const tr = document.createElement('tr');
        const timestamp = new Date(log.timestamp).toLocaleString('id-ID');
        tr.innerHTML = `
          <td>${timestamp}</td>
          <td>${log.heart_rate || '--'} bpm</td>
          <td>${log.spo2 || '--'} %</td>
          <td><span class="badge bg-warning text-dark">${log.status}</span></td>
        `;
        elWarningListTableBody.appendChild(tr);
      });
    });
  }

  // Form Simpan Profil
  if (elProfileForm) {
    elProfileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      elProfileSaveStatus.textContent = 'Menyimpan...';
      elProfileSaveStatus.className = 'ms-3 d-inline text-muted';

      // Kumpulkan kondisi yang dicentang
      const selectedConditions = [];
      elConditionsList.querySelectorAll('input[type="checkbox"]:checked').forEach(input => {
        selectedConditions.push(input.value);
      });

      const profileData = {
        full_name: elProfName.value,
        date_of_birth: elProfDob.value,
        sex: elProfSex.value,
        height: elProfHeight.value,
        weight: elProfWeight.value,
        blood_type: elProfBlood.value,
        conditions: selectedConditions
      };
      
      try {
        const response = await fetch(`/api/users/${activeUserId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileData)
        });
        
        if (!response.ok) throw new Error('Gagal menyimpan profil');
        
        elProfileSaveStatus.textContent = 'Profil berhasil disimpan!';
        elProfileSaveStatus.className = 'ms-3 d-inline text-success';
        
        // (Opsional) Perbarui UI ringkasan pasien secara real-time
        document.getElementById('profile-full_name').textContent = profileData.full_name;
        // ... (Update UI lainnya) ...
        
      } catch (err) {
        elProfileSaveStatus.textContent = err.message;
        elProfileSaveStatus.className = 'ms-3 d-inline text-danger';
      }
    });
  }
  

  // --- 5. ALUR UTAMA SAAT MEMUAT ---
  console.log("Dasbor pribadi dimuat.");

  // Data awal (initialLogs) sudah dikirim dari server
  // (Variabel 'initialLogs' diambil dari tag <script> di EJS)
  if (typeof initialLogs !== 'undefined') {
    const stats = calculateStatistics(initialLogs);
    updateStatisticsUI(stats, initialLogs);
    updateChart(initialLogs);
  } else {
    console.error("initialLogs tidak terdefinisi!");
  }
  
  // Isi form profil dengan data awal
  if (typeof currentUser !== 'undefined' && typeof allConditions !== 'undefined' && typeof userConditions !== 'undefined') {
    loadProfileData(currentUser, userConditions, allConditions);
    updateEwsGauge(currentUser.ews_score || 0);
  } else {
    console.error("Data profil (currentUser, allConditions, userConditions) tidak terdefinisi!");
  }

}); // <-- AKHIR DARI DOMContentLoaded
