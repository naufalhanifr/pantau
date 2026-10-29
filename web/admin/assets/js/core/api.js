// Akses API admin dengan token sesi (disimpan per tab browser).
const ADMIN_TOKEN_KEY = "pantauAdminToken";

function getAdminToken() {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function setAdminToken(token) {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

function errorMessage(detail, status) {
    if (Array.isArray(detail)) return detail.map(item => item.msg || item).join("\n");
    return detail || `HTTP ${status}`;
}

// Unduh file dari API admin (butuh token, jadi tidak bisa lewat <a href> biasa).
async function adminDownload(path) {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
    if (response.status === 401) {
        setAdminToken("");
        showAdminLogin();
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const filename = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "template.xlsx";
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await response.blob()), download: filename });
    link.click();
    URL.revokeObjectURL(link.href);
}

async function adminApi(path, { method = "GET", body, form } = {}) {
    const headers = { Authorization: `Bearer ${getAdminToken()}` };
    let payload;
    if (form) payload = form;
    else if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
    }
    const response = await fetch(path, { method, headers, body: payload });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (response.status === 401 && path !== "/api/admin/login") {
        setAdminToken("");
        showAdminLogin();
    }
    if (!response.ok) throw new Error(errorMessage(data?.detail, response.status));
    return data;
}
