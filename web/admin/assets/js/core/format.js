// Utilitas format angka untuk web admin. MONTHS dan escapeHtml ada di /shared/common.js.
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
    if (text.includes(".") && text.includes(",")) {
        // Pemisah yang muncul terakhir adalah desimal; yang lain pemisah ribuan.
        const decimal = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
        text = text.replaceAll(decimal === "," ? "." : ",", "").replace(decimal, ".");
    } else text = text.replace(/[.,]/g, "");
    const number = Number(text);
    return Number.isFinite(number) ? Math.round(number) : 0;
}
