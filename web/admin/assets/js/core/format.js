// Utilitas format angka/teks untuk web admin.
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

function formatNumber(value) {
    return (Number(value) || 0).toLocaleString("id-ID");
}

function formatRupiah(value) {
    return "Rp " + formatNumber(value);
}

// Terima angka maupun teks seperti "Rp 1.234.567" (sama dengan parser backend).
function parseAmount(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return Math.round(value);
    let text = String(value).replace(/Rp/gi, "").replace(/\s/g, "");
    if (text.includes(".") && !text.includes(",")) text = text.replace(/\./g, "");
    else if (text.includes(",") && !text.includes(".")) text = text.replace(/,/g, "");
    else if (text.includes(".") && text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
    const number = Number(text);
    return Number.isFinite(number) ? Math.round(number) : 0;
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"}[ch]));
}
