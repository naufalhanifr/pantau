// Karyawan PPU BU dan PPU PN: login (dicek server) dan pengamanan sesi karena isinya data pribadi.
// Tiap menu punya kata sandi dan sesi sendiri: masuk atau keluar di satu menu tidak mengubah menu lainnya. Kartu login dipakai bergantian.
// - Token hanya di memori halaman: tutup tab, reload, atau pindah halaman = keluar.
// - Kata sandi tidak disimpan browser: field teks bersamaran, bukan type=password (Chrome mengabaikan autocomplete=off).
// - Keluar lewat tombol Keluar, atau otomatis: 30 menit tanpa aktivitas, koneksi terputus, atau sesi ditolak server.
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
  const passwordInput = () => document.getElementById('employeeLoginPassword');
  function renderMessage(text){
    const box = document.getElementById('employeeLoginError');
    box.textContent = text;
    box.classList.toggle('hidden', !text);
  }

  // page: nilai activePage menu ini; base: awalan API login & refresh; clearData: hapus data pribadi menu ini dari halaman dan memori.
  function createSession(page, base, title, clearData){
    let token = null;
    let idleTimer = null;
    let lastActivity = 0;
    let lastRefresh = 0;
    let message = '';
    function showLogin(show){
      document.querySelector(`[data-karyawan-protected="${page}"]`).classList.toggle('hidden', show);
      if (activePage === page) document.getElementById('employeeLoginPanel').classList.toggle('hidden', !show);
    }
    function showMessage(text){
      message = text;
      if (activePage === page) renderMessage(text);
    }
    // Header Authorization untuk API menu ini; null bila belum masuk.
    const authHeaders = () => token ? { Authorization: `Bearer ${token}` } : null;
    // reason: idle | offline | expired; tanpa reason = keluar tanpa pesan (pindah/tutup halaman).
    function logout(reason){
      const wasLoggedIn = token !== null;
      // Cabut token di server; keepalive agar tetap terkirim saat halaman ditutup.
      if (wasLoggedIn) fetch(`${base}/logout`, { method: 'POST', headers: authHeaders(), keepalive: true }).catch(() => {});
      token = null;
      clearTimeout(idleTimer);
      passwordInput().value = '';
      clearData();
      showLogin(true);
      if (wasLoggedIn && reason) showMessage(LOGOUT_MESSAGES[reason]);
    }
    // body: dikirim sebagai POST, untuk nama dan No. JKN yang tidak boleh masuk URL (tercatat di log nginx).
    async function api(path, body){
      const headers = authHeaders();
      if (!headers) return null;
      try {
        const init = body ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { headers };
        const data = await apiGet(path, init);
        return authHeaders() ? data : null;   // sudah keluar saat request berjalan: buang datanya
      } catch (error) {
        if (error.message.startsWith('HTTP 401')) { logout('expired'); return null; }
        if (error instanceof TypeError) { logout('offline'); return null; }   // fetch gagal = koneksi putus
        throw error;
      }
    }
    async function refreshToken(){
      const sent = token;
      lastRefresh = Date.now();
      try {
        const response = await fetch(`${base}/refresh`, { method: 'POST', headers: authHeaders() });
        if (token !== sent) return;   // sudah keluar saat request berjalan
        if (response.ok) token = (await response.json()).token;
        else if (response.status === 401) logout('expired');
      } catch {
        if (token === sent) logout('offline');
      }
    }
    function onActivity(){
      if (!token || Date.now() - lastActivity < 1000) return;   // pointermove sangat sering; cukup sekali per detik
      lastActivity = Date.now();
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => logout('idle'), IDLE_LIMIT);
      if (lastActivity - lastRefresh >= REFRESH_EVERY) refreshToken();
    }
    function onVisible(){
      if (!token) return;
      if (Date.now() - lastActivity >= IDLE_LIMIT) logout('idle');
      else onActivity();
    }
    async function login(password){
      const input = passwordInput();
      if (!navigator.onLine) {
        showMessage(LOGOUT_MESSAGES.offline);
        return;
      }
      let response = null;
      try {
        response = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
      } catch {}
      if (response?.ok) {
        token = (await response.json()).token;
        lastRefresh = Date.now();
        lastActivity = 0;
        showMessage('');
        onActivity();
        showLogin(false);
        showPage(activePage);   // muat isi menu yang sedang dibuka
        return;
      }
      showMessage(LOGIN_ERRORS[response?.status] || 'Server tidak dapat dihubungi. Coba lagi.');
      input.focus();
    }
    return { title, authHeaders, logout, api, onActivity, onVisible, login, loggedIn: () => token !== null, message: () => message };
  }

  const sessions = {
    employees: createSession('employees', '/api/karyawan', 'Masuk Data Karyawan', () => clearEmployeeData()),
    'ppu-karyawan': createSession('ppu-karyawan', '/api/ppu-pn', 'Masuk Karyawan PPU PN', () => clearPpuData()),
  };
  const allSessions = Object.values(sessions);
  window.employeeAuthHeaders = sessions.employees.authHeaders;
  window.employeeApi = sessions.employees.api;
  window.ppuAuthHeaders = sessions['ppu-karyawan'].authHeaders;
  window.ppuApi = sessions['ppu-karyawan'].api;
  window.karyawanLogout = function(){
    const session = sessions[activePage];
    if (!session) return;
    session.logout();
    renderMessage('');
    passwordInput().focus();
  };

  // Kartu login dibuka untuk menu lain: kata sandi yang sudah diketik tidak boleh ikut terkirim ke menu itu.
  let panelPage = null;
  window.openLoginPanel = function(page){
    const session = sessions[page];
    if (panelPage !== page) passwordInput().value = '';
    panelPage = page;
    document.getElementById('employeeLoginTitle').textContent = session.title;
    document.getElementById('employeeLoginPanel').classList.toggle('hidden', session.loggedIn());
    renderMessage(session.message());
  };

  // pointerdown sudah mencakup klik mouse dan sentuhan.
  ['pointerdown','pointermove','keydown','scroll'].forEach(type => document.addEventListener(type, () => allSessions.forEach(s => s.onActivity()), { passive: true }));
  // Timer di tab latar bisa tertunda (laptop tidur): cek ulang saat tab terlihat lagi.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') allSessions.forEach(s => s.onVisible());
  });
  window.addEventListener('offline', () => allSessions.forEach(s => s.logout('offline')));
  // Pindah atau tutup halaman: hapus data juga dari salinan halaman untuk tombol Back (bfcache).
  window.addEventListener('pagehide', () => allSessions.forEach(s => s.logout()));

  window.employeeLogin = async function(event){
    event.preventDefault();
    const input = passwordInput();
    const password = input.value;
    input.value = '';
    await sessions[activePage].login(password);
    return false;
  };

  // Field bersamaran memakai -webkit-text-security; browser yang tidak mendukungnya kembali ke type=password.
  const canMask = () => CSS.supports('-webkit-text-security', 'disc');
  window.toggleEmployeePassword = function(){
    const input = passwordInput();
    let show;
    if (canMask()) { show = input.style.webkitTextSecurity !== 'none'; input.style.webkitTextSecurity = show ? 'none' : 'disc'; }
    else { input.type = input.type === 'password' ? 'text' : 'password'; show = input.type === 'text'; }
    setPasswordEye(document.getElementById('employeePasswordEye'), show);
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (!canMask()) passwordInput().type = 'password';
  });
})();
