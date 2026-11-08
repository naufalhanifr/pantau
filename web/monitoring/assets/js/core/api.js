// Akses API backend PANTAU (pesan error dari /shared/common.js).
// Dashboard disajikan oleh backend PANTAU yang juga menyediakan API database.
const API_BASE_URL = "";

async function apiGet(path, init) {
    const response = await pantauFetch(`${API_BASE_URL}${path}`, init);
    if (!response.ok) throw await pantauResponseError(response);
    try {
        return await response.json();
    } catch {
        throw new Error(PANTAU_UNREADABLE);
    }
}
