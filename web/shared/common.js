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
