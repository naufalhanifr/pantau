// Dipakai monitoring dan admin: nama bulan (sama dengan MONTHS di backend/config.py) dan escape teks dari database/Excel sebelum masuk HTML.
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"}[ch]));
}

function formatRupiah(value) {
    return "Rp " + (Number(value) || 0).toLocaleString("id-ID");
}

// Ikon tombol tampilkan/sembunyikan kata sandi.
function setPasswordEye(icon, shown) {
    icon.classList.toggle("fa-eye", !shown);
    icon.classList.toggle("fa-eye-slash", shown);
}

// Pesan untuk respons tanpa pesan dari server (misalnya halaman error nginx) dan untuk koneksi putus (kode 0).
// Pesan dari backend PANTAU sendiri selalu dipakai lebih dulu (lihat ERROR_MESSAGES di backend/main.py).
const PANTAU_ERROR_MESSAGES = {
    0: "Tidak dapat terhubung ke server. Periksa koneksi internet, lalu coba lagi.",
    400: "Permintaan tidak valid. Muat ulang halaman, lalu coba lagi.",
    401: "Sesi berakhir atau belum masuk. Silakan masuk kembali.",
    403: "Anda tidak punya akses ke halaman ini.",
    404: "Data yang dicari tidak ditemukan. Muat ulang halaman untuk melihat data terbaru.",
    405: "Halaman ini sudah berubah. Muat ulang halaman; bila tetap muncul, hubungi admin PANTAU.",
    408: "Server terlalu lama merespons. Coba lagi dalam beberapa saat.",
    413: "File atau data yang dikirim ditolak server karena terlalu besar. Hubungi admin PANTAU.",
    422: "Data yang dikirim tidak lengkap atau formatnya salah. Muat ulang halaman, lalu coba lagi.",
    429: "Terlalu banyak percobaan. Tunggu sebentar, lalu coba lagi.",
    500: "Terjadi kesalahan di server. Coba lagi; bila tetap muncul, hubungi admin PANTAU.",
    502: "Server sedang diperbarui atau mengalami gangguan. Coba lagi dalam beberapa menit.",
    503: "Server sedang sibuk. Coba lagi dalam beberapa saat.",
    504: "Server terlalu lama merespons. Coba lagi dalam beberapa saat; untuk file besar, tunggu sebentar lalu cek Riwayat Perubahan.",
};

function pantauErrorMessage(status, bodyText) {
    let detail = null;
    try { detail = JSON.parse(bodyText)?.detail; } catch {}
    if (Array.isArray(detail)) detail = detail.map(item => item?.msg ?? item).join("\n");
    if (typeof detail === "string" && detail) return detail;
    return PANTAU_ERROR_MESSAGES[status] || PANTAU_ERROR_MESSAGES[status >= 500 ? 500 : 400];
}

// fetch untuk API PANTAU: koneksi putus jadi TypeError berpesan jelas (status 0), respons gagal jadi Error dengan status HTTP.
async function pantauFetch(url, init) {
    let response;
    try {
        response = await fetch(url, init);
    } catch {
        throw Object.assign(new TypeError(PANTAU_ERROR_MESSAGES[0]), { status: 0 });
    }
    return response;
}

async function pantauResponseError(response) {
    return Object.assign(new Error(pantauErrorMessage(response.status, await response.text())), { status: response.status });
}

// Respons berhasil tetapi bukan JSON: biasanya halaman proxy atau versi halaman lama.
const PANTAU_UNREADABLE = "Respons server tidak bisa dibaca. Muat ulang halaman, lalu coba lagi.";
