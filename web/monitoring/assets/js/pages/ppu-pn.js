// Menu PPU PN: SKPD > Satker > Karyawan. Data dari /api/ppu-pn lewat employeeApi (karyawan.js): login & sesi sama dengan Daftar Karyawan.
// SKPD dan Satker dari satu ringkasan per Satker (dimuat sekali per login); daftar karyawan difilter dan dipaginasi server.
let ppuSatkerRows = null;     // [{skpd, satker, peserta}]
let ppuPesertaPage = 1;
let ppuPesertaSize = 10;
let ppuRequestId = 0;         // abaikan respons lama bila filter berubah cepat atau sudah keluar
let ppuFilterTimer = null;
const ppuById = id => document.getElementById(id);
const ppuCount = n => Number(n).toLocaleString("id-ID");
const ppuMessageRow = text => `<tr><td colspan="5" class="pantau-empty-state">${escapeHtml(text)}</td></tr>`;
const ppuOptions = (all, names) => `<option value="">${all}</option>` + names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
const PPU_BODIES = ["ppuSkpdBody", "ppuSatkerBody", "ppuPesertaBody"];
// Tombol aksi: pola tombol Detail di Daftar Karyawan. Nama dikirim lewat data-*, bukan disisipkan ke kode onclick.
const ppuAction = (label, onclick, data) => `<button type="button" class="inline-flex min-h-[44px] items-center justify-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition" ${data} onclick="${onclick}"><span>${label}</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>`;

// Dipanggil saat keluar (logoutEmployee): hapus data dari halaman dan memori.
function clearPpuData() {
    ppuRequestId++;
    ppuSatkerRows = null;
    ppuPesertaPage = 1;
    PPU_BODIES.forEach(id => { ppuById(id).innerHTML = ppuMessageRow("Memuat data..."); });
    ["ppuSatkerSkpdFilter", "ppuPesertaSkpdFilter", "ppuPesertaSatkerFilter", "ppuPesertaPaginationControls"].forEach(id => { ppuById(id).innerHTML = ""; });
    ["ppuSkpdCount", "ppuSatkerCount", "ppuPesertaCount", "ppuPesertaPaginationInfo"].forEach(id => { ppuById(id).textContent = ""; });
    ppuById("ppuPesertaSearch").value = "";
}

// view: skpd | satker | karyawan (dari showPage, setelah login juga).
async function showPpuPage(view) {
    document.querySelectorAll("[data-ppu-view]").forEach(el => el.classList.toggle("hidden", el.dataset.ppuView !== view));
    if (!employeeAuthHeaders()) return;
    if (!ppuSatkerRows) {
        const requestId = ppuRequestId;
        let data;
        try {
            data = await employeeApi("/api/ppu-pn/satker");
        } catch (error) {
            PPU_BODIES.forEach(id => { ppuById(id).innerHTML = ppuMessageRow(`Gagal memuat data PPU PN: ${error.message}`); });
            return;
        }
        if (!data || requestId !== ppuRequestId) return;
        ppuSatkerRows = data.rows;
        const skpdNames = [...new Set(ppuSatkerRows.map(r => r.skpd))];
        ppuById("ppuSatkerSkpdFilter").innerHTML = ppuById("ppuPesertaSkpdFilter").innerHTML = ppuOptions("Semua SKPD", skpdNames);
    }
    if (view === "skpd") renderPpuSkpd();
    if (view === "satker") renderPpuSatker();
    if (view === "karyawan") { renderPpuSatkerOptions(); loadPpuPeserta(); }
}

function renderPpuSkpd() {
    const bySkpd = new Map();
    ppuSatkerRows.forEach(r => {
        const item = bySkpd.get(r.skpd) || { skpd: r.skpd, satker: 0, peserta: 0 };
        item.satker++;
        item.peserta += r.peserta;
        bySkpd.set(r.skpd, item);
    });
    const rows = [...bySkpd.values()];
    ppuById("ppuSkpdBody").innerHTML = rows.map((r, i) => `<tr>
        <td class="text-center" data-label="No">${i + 1}</td><td data-label="SKPD">${escapeHtml(r.skpd)}</td>
        <td class="text-right" data-label="Jumlah Satker">${ppuCount(r.satker)}</td><td class="text-right" data-label="Jumlah Peserta">${ppuCount(r.peserta)}</td>
        <td class="text-center" data-label="">${ppuAction("Lihat Satker", "openPpuSatker(this.dataset.skpd)", `data-skpd="${escapeHtml(r.skpd)}"`)}</td></tr>`).join("")
        || ppuMessageRow("Belum ada data PPU PN.");
    ppuById("ppuSkpdCount").textContent = `${ppuCount(rows.length)} SKPD, ${ppuCount(ppuSatkerRows.length)} Satker, ${ppuCount(rows.reduce((sum, r) => sum + r.peserta, 0))} peserta`;
}

function renderPpuSatker() {
    const skpd = ppuById("ppuSatkerSkpdFilter").value;
    const rows = ppuSatkerRows.filter(r => !skpd || r.skpd === skpd);
    ppuById("ppuSatkerBody").innerHTML = rows.map((r, i) => `<tr>
        <td class="text-center" data-label="No">${i + 1}</td><td data-label="Satker">${escapeHtml(r.satker)}</td><td data-label="SKPD">${escapeHtml(r.skpd)}</td>
        <td class="text-right" data-label="Jumlah Peserta">${ppuCount(r.peserta)}</td>
        <td class="text-center" data-label="">${ppuAction("Lihat Karyawan", "openPpuPeserta(this.dataset.skpd, this.dataset.satker)", `data-skpd="${escapeHtml(r.skpd)}" data-satker="${escapeHtml(r.satker)}"`)}</td></tr>`).join("")
        || ppuMessageRow("Tidak ada Satker untuk SKPD ini.");
    ppuById("ppuSatkerCount").textContent = `${ppuCount(rows.length)} Satker, ${ppuCount(rows.reduce((sum, r) => sum + r.peserta, 0))} peserta`;
}

// Opsi Satker mengikuti SKPD terpilih; pilihan Satker dipertahankan bila masih ada di daftar.
function renderPpuSatkerOptions() {
    const select = ppuById("ppuPesertaSatkerFilter");
    const current = select.value;
    const skpd = ppuById("ppuPesertaSkpdFilter").value;
    const names = [...new Set(ppuSatkerRows.filter(r => !skpd || r.skpd === skpd).map(r => r.satker))];
    select.innerHTML = ppuOptions("Semua Satker", names);
    select.value = names.includes(current) ? current : "";
}

// Drill-down: SKPD -> Satker-nya, Satker -> karyawannya.
function openPpuSatker(skpd) {
    ppuById("ppuSatkerSkpdFilter").value = skpd;
    showPage("ppu-satker");
}
function openPpuPeserta(skpd, satker) {
    ppuById("ppuPesertaSkpdFilter").value = skpd;
    renderPpuSatkerOptions();
    ppuById("ppuPesertaSatkerFilter").value = satker;
    ppuById("ppuPesertaSearch").value = "";
    ppuPesertaPage = 1;
    showPage("ppu-karyawan");
}

// Jeda singkat agar mengetik di pencarian tidak mengirim satu request per huruf.
function filterPpuPeserta() {
    clearTimeout(ppuFilterTimer);
    ppuFilterTimer = setTimeout(() => { ppuPesertaPage = 1; loadPpuPeserta(); }, 250);
}
function changePpuPesertaPageSize() {
    ppuPesertaSize = Number(ppuById("ppuPesertaPageSize").value || 10);
    ppuPesertaPage = 1;
    loadPpuPeserta();
}
function goPpuPesertaPage(page) {
    ppuPesertaPage = Math.max(1, page);
    loadPpuPeserta();
}
async function loadPpuPeserta() {
    const requestId = ++ppuRequestId;
    const params = new URLSearchParams({
        skpd: ppuById("ppuPesertaSkpdFilter").value,
        satker: ppuById("ppuPesertaSatkerFilter").value,
        q: ppuById("ppuPesertaSearch").value.trim(),
        page: ppuPesertaPage,
        size: ppuPesertaSize,
    });
    let data;
    try {
        data = await employeeApi(`/api/ppu-pn/peserta?${params}`);
    } catch (error) {
        if (requestId === ppuRequestId) ppuById("ppuPesertaBody").innerHTML = ppuMessageRow(`Gagal memuat data karyawan: ${error.message}`);
        return;
    }
    if (!data || requestId !== ppuRequestId) return;
    ppuPesertaPage = data.page;
    const start = (data.page - 1) * ppuPesertaSize;
    ppuById("ppuPesertaBody").innerHTML = data.rows.map((r, i) => `<tr>
        <td class="text-center" data-label="No">${start + i + 1}</td><td data-label="Nama Peserta">${escapeHtml(r.nama_peserta)}</td>
        <td data-label="Status Peserta">${escapeHtml(r.status)}</td><td data-label="Satker">${escapeHtml(r.satker)}</td><td data-label="SKPD">${escapeHtml(r.skpd)}</td></tr>`).join("")
        || ppuMessageRow("Tidak ada karyawan yang cocok. Ubah pencarian atau filter.");
    ppuById("ppuPesertaCount").textContent = `${ppuCount(data.total)} karyawan ditemukan`;
    ppuById("ppuPesertaPaginationInfo").textContent = data.total ? `Menampilkan ${start + 1}-${start + data.rows.length} dari ${ppuCount(data.total)} data` : "Tidak ada data";
    ppuById("ppuPesertaPaginationControls").innerHTML = pantauPagination(data.page, Math.max(1, Math.ceil(data.total / ppuPesertaSize)), page => `goPpuPesertaPage(${page})`);
}
