// Login admin: kata sandi diperiksa di server, token sesi berlaku 8 jam dan berakhir lebih awal setelah 30 menit tanpa aktivitas.
const ADMIN_IDLE_LIMIT = 30 * 60 * 1000;
let adminLastActivity = Date.now();

// Isian Workspace tidak dihapus: setelah masuk lagi, perubahan yang belum disimpan masih ada.
async function endAdminSession(message) {
    const token = getAdminToken();
    if (token) fetch("/api/admin/logout", { method: "POST", headers: { Authorization: `Bearer ${token}` }, keepalive: true }).catch(() => {});
    setAdminToken("");
    showAdminLogin();
    const box = document.getElementById("adminLoginError");
    box.textContent = message;
    box.classList.toggle("hidden", !message);
}

// Token ditolak server di tengah kerja: kembali ke login dengan alasannya (isian Workspace tetap ada).
function expireAdminSession(message) {
    setAdminToken("");
    showAdminLogin();
    const box = document.getElementById("adminLoginError");
    box.textContent = message;
    box.classList.remove("hidden");
}

function checkAdminIdle() {
    if (getAdminToken() && Date.now() - adminLastActivity >= ADMIN_IDLE_LIMIT) endAdminSession("Sesi berakhir karena tidak aktif selama 30 menit. Silakan masuk kembali.");
}
["pointerdown", "keydown", "scroll"].forEach(type => document.addEventListener(type, () => { adminLastActivity = Date.now(); }, { passive: true }));
setInterval(checkAdminIdle, 30 * 1000);
// Timer di tab latar bisa tertunda (laptop tidur): cek ulang saat tab terlihat lagi.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkAdminIdle(); });

function showAdminLogin() {
    document.getElementById("adminLogin")?.classList.remove("hidden");
    document.getElementById("adminApp")?.classList.add("hidden");
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.getElementById("adminPassword")?.focus();
}

function showAdminApp() {
    document.getElementById("adminLogin")?.classList.add("hidden");
    document.getElementById("adminApp")?.classList.remove("hidden");
}

async function adminLogin(event) {
    event?.preventDefault();
    const input = document.getElementById("adminPassword");
    const error = document.getElementById("adminLoginError");
    try {
        const result = await adminApi("/api/admin/login", { method: "POST", body: { password: input.value } });
        setAdminToken(result.token);
        adminLastActivity = Date.now();
        input.value = "";
        error.classList.add("hidden");
        showAdminApp();
        showAdminPage(activeAdminPage);
    } catch (err) {
        error.textContent = err.message;
        error.classList.remove("hidden");
        input.value = "";
        input.focus();
    }
    return false;
}

async function adminLogout() {
    if (hasUnsavedWorkspace() && !(await pantauConfirm({
        title: "Keluar tanpa menyimpan?", message: "Perubahan di workspace belum disimpan dan akan hilang.", tone: "danger", confirmText: "Buang perubahan", cancelText: "Tetap di sini",
    }))) return;
    endAdminSession("");
}

function toggleAdminPassword() {
    const input = document.getElementById("adminPassword");
    const eye = document.getElementById("adminPasswordEye");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    setPasswordEye(eye, show);
}
