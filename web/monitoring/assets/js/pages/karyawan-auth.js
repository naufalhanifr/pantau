// Daftar Karyawan: login (dicek server) dan pengamanan sesi karena isinya data pribadi.
// - Token hanya di memori halaman: tutup tab, reload, atau pindah halaman = keluar.
// - Kata sandi tidak disimpan browser: field teks bersamaran, bukan type=password (Chrome mengabaikan autocomplete=off).
// - Keluar otomatis: 30 menit tanpa aktivitas, koneksi terputus, atau sesi ditolak server.
// - Token dari server juga hanya berlaku 30 menit; selama pengguna aktif, diperpanjang paling cepat tiap 5 menit.
(function(){
  const IDLE_LIMIT = 30 * 60 * 1000;
  const REFRESH_EVERY = 5 * 60 * 1000;
  const LOGOUT_MESSAGES = {
    idle: 'Sesi berakhir karena tidak aktif selama 30 menit. Silakan masuk kembali.',
    offline: 'Koneksi terputus. Silakan masuk kembali setelah jaringan tersambung.',
    expired: 'Sesi berakhir. Silakan masuk kembali.',
  };
  const LOGIN_ERRORS = { 401: 'Kata sandi tidak sesuai.', 403: 'Login belum bisa dipakai karena kata sandi server belum diatur. Hubungi admin PANTAU.', 429: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' };
  let token = null;
  let idleTimer = null;
  let lastActivity = 0;
  let lastRefresh = 0;
  const passwordInput = () => document.getElementById('employeeLoginPassword');
  function showLogin(show){
    document.getElementById('employeeLoginPanel').classList.toggle('hidden', !show);
    document.getElementById('employeesProtectedContent').classList.toggle('hidden', show);
  }
  function showMessage(text){
    const box = document.getElementById('employeeLoginError');
    box.textContent = text;
    box.classList.toggle('hidden', !text);
  }

  // Header Authorization untuk API karyawan; null bila belum masuk.
  window.employeeAuthHeaders = () => token ? { Authorization: `Bearer ${token}` } : null;
  // reason: idle | offline | expired; tanpa reason = keluar tanpa pesan (pindah/tutup halaman).
  window.logoutEmployee = function(reason){
    const wasLoggedIn = token !== null;
    token = null;
    clearTimeout(idleTimer);
    passwordInput().value = '';
    clearEmployeeData();
    showLogin(true);
    if (wasLoggedIn && reason) showMessage(LOGOUT_MESSAGES[reason]);
  };

  async function refreshToken(){
    const sent = token;
    lastRefresh = Date.now();
    try {
      const response = await fetch('/api/karyawan/refresh', { method: 'POST', headers: employeeAuthHeaders() });
      if (token !== sent) return;   // sudah keluar saat request berjalan
      if (response.ok) token = (await response.json()).token;
      else if (response.status === 401) logoutEmployee('expired');
    } catch {
      if (token === sent) logoutEmployee('offline');
    }
  }
  function onActivity(){
    if (!token || Date.now() - lastActivity < 1000) return;   // pointermove sangat sering; cukup sekali per detik
    lastActivity = Date.now();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => logoutEmployee('idle'), IDLE_LIMIT);
    if (lastActivity - lastRefresh >= REFRESH_EVERY) refreshToken();
  }
  // pointerdown sudah mencakup klik mouse dan sentuhan.
  ['pointerdown','pointermove','keydown','scroll'].forEach(type => document.addEventListener(type, onActivity, { passive: true }));
  // Timer di tab latar bisa tertunda (laptop tidur): cek ulang saat tab terlihat lagi.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !token) return;
    if (Date.now() - lastActivity >= IDLE_LIMIT) logoutEmployee('idle');
    else onActivity();
  });
  window.addEventListener('offline', () => logoutEmployee('offline'));
  // Pindah atau tutup halaman: hapus data juga dari salinan halaman untuk tombol Back (bfcache).
  window.addEventListener('pagehide', () => logoutEmployee());

  window.employeeLogin = async function(event){
    event.preventDefault();
    const input = passwordInput();
    const password = input.value;
    input.value = '';
    if (!navigator.onLine) {
      showMessage(LOGOUT_MESSAGES.offline);
      return false;
    }
    let response = null;
    try {
      response = await fetch('/api/karyawan/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
    } catch {}
    if (response?.ok) {
      token = (await response.json()).token;
      lastRefresh = Date.now();
      lastActivity = 0;
      showMessage('');
      onActivity();
      showLogin(false);
      showEmployeesPage();
      return false;
    }
    showMessage(LOGIN_ERRORS[response?.status] || 'Server tidak dapat dihubungi. Coba lagi.');
    input.focus();
    return false;
  };

  // Field bersamaran memakai -webkit-text-security; browser yang tidak mendukungnya kembali ke type=password.
  const canMask = () => CSS.supports('-webkit-text-security', 'disc');
  window.toggleEmployeePassword = function(){
    const input = passwordInput();
    let show;
    if (canMask()) { show = input.style.webkitTextSecurity !== 'none'; input.style.webkitTextSecurity = show ? 'none' : 'disc'; }
    else { input.type = input.type === 'password' ? 'text' : 'password'; show = input.type === 'text'; }
    const eye = document.getElementById('employeePasswordEye');
    eye.classList.toggle('fa-eye', !show);
    eye.classList.toggle('fa-eye-slash', show);
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (!canMask()) passwordInput().type = 'password';
  });
})();
