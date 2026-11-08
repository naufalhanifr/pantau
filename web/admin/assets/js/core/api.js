// Akses API admin dengan token sesi (disimpan per tab browser).
const ADMIN_TOKEN_KEY = "pantauAdminToken";

function getAdminToken() {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
}

function setAdminToken(token) {
    if (token) sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    else sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

// Unduh file dari API admin (butuh token, jadi tidak bisa lewat <a href> biasa).
async function adminDownload(path) {
    const response = await pantauFetch(path, { headers: { Authorization: `Bearer ${getAdminToken()}` } });
    if (!response.ok) {
        const error = await pantauResponseError(response);
        if (response.status === 401) expireAdminSession(error.message);
        throw error;
    }
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
    const response = await pantauFetch(path, { method, headers, body: payload });
    if (!response.ok) {
        const error = await pantauResponseError(response);
        if (response.status === 401 && path !== "/api/admin/login") expireAdminSession(error.message);
        throw error;
    }
    const text = await response.text();
    try {
        return text ? JSON.parse(text) : null;
    } catch {
        throw new Error(PANTAU_UNREADABLE);
    }
}
