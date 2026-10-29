// Akses API backend PANTAU.
// Dashboard disajikan oleh backend PANTAU yang juga menyediakan API database.
const API_BASE_URL = "";

async function apiGet(path) {
    const response = await fetch(`${API_BASE_URL}${path}`);
    const body = await response.text();
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body || "Tidak ada detail error."}`);
    }
    try {
        return JSON.parse(body);
    } catch {
        throw new Error("Respons API bukan JSON yang valid.");
    }
}
