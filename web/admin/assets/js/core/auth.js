// Login admin: kata sandi diperiksa di server, token sesi berlaku 8 jam.
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
    setAdminToken("");
    showAdminLogin();
}

function toggleAdminPassword() {
    const input = document.getElementById("adminPassword");
    const eye = document.getElementById("adminPasswordEye");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    eye.classList.toggle("fa-eye", !show);
    eye.classList.toggle("fa-eye-slash", show);
}
