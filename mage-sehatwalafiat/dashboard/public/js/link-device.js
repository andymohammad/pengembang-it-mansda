// public/js/link-device.js
document.addEventListener('DOMContentLoaded', () => {
  
  const deviceId = document.body.dataset.deviceId;
  let selectedUserId = null;
  
  // Referensi DOM
  const elExistingUserList = document.getElementById('existing-user-list');
  const elLinkExistingTab = document.getElementById('link-existing-tab');
  const elLinkNewTab = document.getElementById('link-new-tab');
  const elLinkExistingUserBtn = document.getElementById('link-existing-user-btn');
  const elCreateAndLinkUserBtn = document.getElementById('create-and-link-user-btn');
  const elNewUserForm = document.getElementById('new-user-form');
  const elPageStatus = document.getElementById('page-status');

  // Listener untuk Tab
  elLinkExistingTab.addEventListener('click', () => {
    elLinkExistingUserBtn.classList.remove('d-none');
    elCreateAndLinkUserBtn.classList.add('d-none');
  });
  elLinkNewTab.addEventListener('click', () => {
    elLinkExistingUserBtn.classList.add('d-none');
    elCreateAndLinkUserBtn.classList.remove('d-none');
  });

  // Listener untuk memilih user dari daftar
  elExistingUserList.querySelectorAll('li').forEach(li => {
    li.addEventListener('click', () => {
      elExistingUserList.querySelectorAll('li').forEach(item => item.classList.remove('active'));
      li.classList.add('active');
      selectedUserId = li.dataset.userId;
    });
  });

  // Listener Tombol "Mulai Sesi"
  elLinkExistingUserBtn.addEventListener('click', async () => {
    if (!selectedUserId) {
      elPageStatus.textContent = 'Silakan pilih pengguna.';
      return;
    }
    await startSession(selectedUserId);
  });

  // Listener Form "Buat & Mulai Sesi"
  elNewUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    elCreateAndLinkUserBtn.disabled = true;
    elPageStatus.textContent = 'Membuat pengguna baru...';

    const formData = {
      full_name: document.getElementById('new-user-name').value,
      date_of_birth: document.getElementById('new-user-dob').value,
      sex: document.getElementById('new-user-sex').value
    };

    try {
      // 1. Buat pengguna baru
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const newUser = await response.json();
      if (!response.ok) throw new Error(newUser.error || 'Gagal membuat pengguna');

      // 2. Mulai sesi dengan pengguna baru
      await startSession(newUser.id);

    } catch (err) {
      elPageStatus.textContent = err.message;
      elCreateAndLinkUserBtn.disabled = false;
    }
  });

  // Fungsi helper untuk memanggil API
  async function startSession(userId) {
    elPageStatus.textContent = 'Memulai sesi...';
    try {
      const response = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId, userId: userId })
      });
      
      if (!response.ok) throw new Error('Gagal memulai sesi');
      
      // SUKSES! Arahkan ke dashboard
      window.location.href = `/dashboard/${deviceId}`;
      
    } catch (err) {
      elPageStatus.textContent = err.message;
    }
  }
});