// Design system: tombol pagination tabel PANTAU (Dashboard, Daftar Badan Usaha, Daftar Karyawan).
// go(page) mengembalikan isi atribut onclick, misalnya page => `goEmployeePage(${page})`.
function pantauPageButton(label, page, go, { disabled = false, active = false } = {}) {
    const state = active ? "pantau-green-active" : disabled ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white text-slate-700 border-slate-200";
    // Halaman aktif tidak di-disable agar nomornya tetap terlihat jelas.
    return `<button type="button" class="pantau-page-btn px-3 py-2 rounded-xl border text-xs font-medium transition ${state}" aria-label="Halaman ${page}"${active ? ' aria-current="page"' : ""}${disabled && !active ? " disabled" : ""} onclick="${go(page)}">${label}</button>`;
}

// Tombol pertama/sebelumnya, maksimal 5 nomor di sekitar halaman aktif, lalu berikutnya/terakhir.
function pantauPagination(current, pages, go, { edges = true } = {}) {
    const icon = name => `<i class="fa-solid fa-${name} text-xs"></i>`;
    const end = Math.min(pages, Math.max(1, current - 2) + 4);
    const start = Math.max(1, end - 4);
    let html = edges ? pantauPageButton(icon("angles-left"), 1, go, { disabled: current === 1 }) : "";
    html += pantauPageButton(icon("chevron-left"), Math.max(1, current - 1), go, { disabled: current === 1 });
    for (let n = start; n <= end; n++) html += pantauPageButton(String(n), n, go, { active: n === current });
    html += pantauPageButton(icon("chevron-right"), Math.min(pages, current + 1), go, { disabled: current === pages });
    if (edges) html += pantauPageButton(icon("angles-right"), pages, go, { disabled: current === pages });
    return html;
}
