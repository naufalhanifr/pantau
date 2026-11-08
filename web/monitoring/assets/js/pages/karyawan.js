// Daftar Karyawan per bulan tagih: data dari /api/karyawan (filter, pencarian, dan pagination dihitung server).
// Select Status & Tampil memakai select-menu.js; combobox badan usaha di bawah ini karena bisa diketik.
let employeeCurrentPage = 1;
let employeePageSize = 10;
let employeeRows = [];              // baris halaman aktif
let employeeBusinessNames = [];     // badan usaha pada bulan terpilih
let employeeRequestId = 0;          // abaikan respons lama bila filter berubah cepat
let employeeFilterTimer = null;
let employeeSortColumn = null;      // kunci kolom (data-sort-column); null = urutan file
let employeeSortAsc = true;
const employeeLower = value => String(value || "").trim().toLocaleLowerCase("id-ID");
const employeeCurrency = new Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0});
// Tanggal ISO dari API (2026-07-31) ke dd/mm/yyyy.
const employeeDate = iso => iso ? iso.split("-").reverse().join("/") : "-";
// Status bayar bulan tagih terpilih (dihitung server) -> badge design system.
const EMPLOYEE_PAY_STATUS = { lunas: ["Lunas", "pantau-badge-success"], nyicil: ["Nyicil", "pantau-badge-warning"], belum: ["Belum Bayar", ""] };
const EMPLOYEE_SUMMARY_CARDS = { lunas: "employeeCardLunas", nyicil: "employeeCardNyicil", belum: "employeeCardBelum" };
const employeePayBadge = status => { const [label, tone] = EMPLOYEE_PAY_STATUS[status]; return `<span class="pantau-badge ${tone}">${label}</span>`; };
// Pembayaran tanpa tanggal tetap ditampilkan nominalnya (sama dengan aturan simpan di server).
const employeePaid = r => r.tanggal_bayar || r.jumlah_bayar ? employeeCurrency.format(r.jumlah_bayar) : "-";

// Dipanggil saat keluar: hapus data pribadi dari halaman dan memori.
function clearEmployeeData() {
    employeeRequestId++;   // respons yang masih berjalan diabaikan
    employeeRows = [];
    employeeBusinessNames = [];
    employeeCurrentPage = 1;
    const business = document.getElementById("employeeBusinessFilter");
    business.value = business.dataset.selectedBusiness = "";
    document.getElementById("employeeSearchInput").value = "";
    document.getElementById("employeeMonthFilter").innerHTML = "";
    ["employeeBusinessDropdown", "employeePaginationControls", "employeeDetailInfo", "employeeDetailHistory"]
        .forEach(id => { document.getElementById(id).innerHTML = ""; });
    // Login berikutnya mulai dengan status memuat, bukan tabel kosong.
    document.getElementById("employeeTableBody").innerHTML = '<tr><td colspan="11" class="pantau-empty-state">Memuat data...</td></tr>';
    ["employeeCountLabel", "employeePaginationInfo", "employeePeriodLabel", ...Object.values(EMPLOYEE_SUMMARY_CARDS)].forEach(id => { document.getElementById(id).textContent = ""; });
    document.querySelectorAll(".employee-summary-period").forEach(el => { el.textContent = ""; });
    document.getElementById("employeeDetailDialog").close();
}
function showEmployeeError(error) {
    document.getElementById("employeeTableBody").innerHTML = `<tr><td colspan="11" class="pantau-empty-state">Gagal memuat data karyawan: ${escapeHtml(error.message)}</td></tr>`;
}

// Dipanggil saat menu dibuka atau setelah masuk.
function showEmployeesPage() {
    if (!employeeAuthHeaders()) return;
    if (document.getElementById("employeeMonthFilter").options.length) loadEmployees();
    else loadEmployeeMeta();
}
// Bulan tersedia + daftar badan usaha bulan terpilih, lalu muat ulang tabel dari halaman 1.
async function loadEmployeeMeta() {
    const select = document.getElementById("employeeMonthFilter");
    let meta;
    try {
        meta = await employeeApi(`/api/karyawan/meta?bulan=${encodeURIComponent(select.value)}`);
    } catch (error) {
        return showEmployeeError(error);
    }
    if (!meta) return;
    if (!meta.months.length) {
        document.getElementById("employeeTableBody").innerHTML = '<tr><td colspan="11" class="pantau-empty-state">Belum ada data karyawan. Data akan tampil setelah diunggah oleh admin PANTAU.</td></tr>';
        ["employeeCountLabel", "employeePaginationInfo"].forEach(id => { document.getElementById(id).textContent = "Belum ada data"; });
        return;
    }
    select.innerHTML = meta.months.map(m => `<option value="${escapeHtml(m.bulan)}">${escapeHtml(m.bulan)}</option>`).join("");
    select.value = meta.bulan;
    document.getElementById("employeePeriodLabel").textContent = meta.bulan;
    document.querySelectorAll(".employee-summary-period").forEach(el => { el.textContent = meta.bulan; });
    employeeBusinessNames = meta.businesses;
    Object.entries(EMPLOYEE_SUMMARY_CARDS).forEach(([status, id]) => { document.getElementById(id).innerHTML = `<span class="block text-base font-semibold">Total</span><span class="block">${meta.summary[status].toLocaleString("id-ID")}</span>`; });
    employeeCurrentPage = 1;
    loadEmployees();
}

function renderEmployeeBusinessOptions() {
    const input = document.getElementById("employeeBusinessFilter");
    const query = employeeLower(input.value);
    const selected = employeeLower(input.dataset.selectedBusiness);
    const rows = [{name:"", label:"Semua Badan Usaha"}, ...employeeBusinessNames.filter(name => employeeLower(name).includes(query)).map(name => ({name, label:name}))];
    document.getElementById("employeeBusinessDropdown").innerHTML = rows.map(item => {
        const isSelected = employeeLower(item.name) === selected;
        return `<button type="button" role="option" aria-selected="${isSelected}" class="pantau-dropdown-option" data-business="${escapeHtml(item.name)}" onclick="selectEmployeeBusiness(this.dataset.business)">${escapeHtml(item.label)}${isSelected ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ''}</button>`;
    }).join("");
}
function setEmployeeBusinessDropdown(open) {
    const dropdown = document.getElementById("employeeBusinessDropdown");
    dropdown.classList.toggle("hidden", !open);
    if (open) pantauPlaceDropdown(document.getElementById("employeeBusinessCombo"), dropdown);
    document.getElementById("employeeBusinessFilter").setAttribute("aria-expanded", String(open));
}
function openEmployeeBusinessDropdown() { renderEmployeeBusinessOptions(); setEmployeeBusinessDropdown(true); }
function closeEmployeeBusinessDropdown() { setEmployeeBusinessDropdown(false); }
function toggleEmployeeBusinessDropdown() {
    if (!document.getElementById("employeeBusinessDropdown").classList.contains("hidden")) return closeEmployeeBusinessDropdown();
    document.getElementById("employeeBusinessFilter").focus();
    openEmployeeBusinessDropdown();
}
function selectEmployeeBusiness(name) {
    const input = document.getElementById("employeeBusinessFilter");
    input.value = input.dataset.selectedBusiness = name || "";
    closeEmployeeBusinessDropdown();
    filterEmployees();
}
function handleEmployeeBusinessKeydown(event) {
    if (event.key === "Escape") return closeEmployeeBusinessDropdown();
    if (event.key === "Enter") {
        event.preventDefault();
        document.querySelector("#employeeBusinessDropdown button")?.click();
    }
}
document.addEventListener("click", event => {
    if (!event.target.closest("#employeeBusinessCombo")) closeEmployeeBusinessDropdown();
});

// Jeda singkat agar mengetik di pencarian tidak mengirim satu request per huruf.
function filterEmployees() {
    clearTimeout(employeeFilterTimer);
    employeeFilterTimer = setTimeout(() => { employeeCurrentPage = 1; loadEmployees(); }, 250);
}
function changeEmployeePageSize() {
    employeePageSize = Number(document.getElementById("employeePageSize").value || 10);
    employeeCurrentPage = 1;
    loadEmployees();
}
// Klik kolom: naik, turun, lalu kembali ke urutan file (sama seperti Daftar Badan Usaha). Diurutkan di server.
function sortEmployees(column) {
    if (employeeSortColumn !== column) { employeeSortColumn = column; employeeSortAsc = true; }
    else if (employeeSortAsc) employeeSortAsc = false;
    else employeeSortColumn = null;
    document.querySelectorAll("#employeeTableScroll th[data-sort-column]").forEach(th => {
        const dir = th.dataset.sortColumn !== employeeSortColumn ? null : employeeSortAsc ? "asc" : "desc";
        th.classList.toggle("is-sort-asc", dir === "asc");
        th.classList.toggle("is-sort-desc", dir === "desc");
        th.querySelector(".column-sort-btn i").className = !dir ? "fa-solid fa-sort" : `fa-solid fa-sort-${dir === "asc" ? "up" : "down"}`;
        th.setAttribute("aria-sort", !dir ? "none" : dir === "asc" ? "ascending" : "descending");
    });
    employeeCurrentPage = 1;
    loadEmployees();
}
function goEmployeePage(page) {
    employeeCurrentPage = Math.max(1, page);
    loadEmployees();
}
async function loadEmployees() {
    const bulan = document.getElementById("employeeMonthFilter").value;
    if (!bulan) return;
    const requestId = ++employeeRequestId;
    const params = {
        bulan,
        q: document.getElementById("employeeSearchInput").value.trim(),
        status: document.getElementById("employeeStatusFilter").value,
        bayar: document.getElementById("employeePaidFilter").value,
        sort: employeeSortColumn || "",
        dir: employeeSortAsc ? "asc" : "desc",
        bu: document.getElementById("employeeBusinessFilter").dataset.selectedBusiness || "",
        page: employeeCurrentPage,
        size: employeePageSize,
    };
    let data;
    try {
        data = await employeeApi("/api/karyawan/search", params);
    } catch (error) {
        if (requestId === employeeRequestId) showEmployeeError(error);
        return;
    }
    if (!data || requestId !== employeeRequestId) return;
    employeeRows = data.rows;
    employeeCurrentPage = data.page;
    renderEmployeeTable(data.total);
}
function renderEmployeeTable(total) {
    const pages = Math.max(1, Math.ceil(total / employeePageSize));
    const start = (employeeCurrentPage - 1) * employeePageSize;
    document.getElementById("employeeTableBody").innerHTML = employeeRows.length ? employeeRows.map((r, i) => `<tr>
        <td>${start+i+1}</td><td>${escapeHtml(r.nama_bu)}</td><td>${escapeHtml(r.nama_peserta)}</td>
        <td>${escapeHtml(r.nama_keluarga)}</td><td>${escapeHtml(r.status)}</td>
        <td class="text-center">${Number(r.bulan_menunggak).toLocaleString("id-ID")}</td>
        <td class="text-right">${employeeCurrency.format(r.nominal_tagihan)}</td>
        <td class="text-right">${employeePaid(r)}</td><td>${employeeDate(r.tanggal_bayar)}</td>
        <td>${employeePayBadge(r.status_bayar)}</td>
        <td class="text-center"><button type="button" class="inline-flex min-h-[44px] items-center justify-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition" onclick="openEmployeeDetail(${i})"><i class="fa-regular fa-eye"></i><span>Detail</span></button></td></tr>`).join("") :
        `<tr><td colspan="11" class="pantau-empty-state">Tidak ada data karyawan yang cocok. Ubah pencarian atau filter.</td></tr>`;
    document.getElementById("employeePaginationInfo").textContent = total ? `Menampilkan ${start+1}-${start+employeeRows.length} dari ${total.toLocaleString("id-ID")} data` : "Tidak ada data";
    document.getElementById("employeeCountLabel").textContent = `${total.toLocaleString("id-ID")} data karyawan ditemukan`;
    document.getElementById("employeePaginationControls").innerHTML = pantauPagination(employeeCurrentPage, pages, page => `goEmployeePage(${page})`);
}


// Popup detail: identitas (termasuk Kode BU & No. JKN yang tidak tampil di tabel) + riwayat Januari s.d. bulan tagih terpilih.
async function openEmployeeDetail(index) {
    const r = employeeRows[index];
    if (!r) return;
    const info = [
        ["Badan Usaha", r.nama_bu], ["Kode BU", r.kode_bu],
        ["Peserta", r.nama_peserta], ["No. JKN Peserta", r.noka_peserta],
        ["Peserta/Keluarga", r.nama_keluarga], ["No. JKN Peserta/Keluarga", r.noka_keluarga],
        ["Bulan Menunggak", Number(r.bulan_menunggak).toLocaleString("id-ID")], ["Tagihan", employeeCurrency.format(r.nominal_tagihan)],
        ["Nominal Pembayaran", employeePaid(r)], ["Terakhir Pembayaran", employeeDate(r.tanggal_bayar)],
    ].map(([label, value]) => [label, escapeHtml(value)]);
    info.push(["Status Bayar", employeePayBadge(r.status_bayar)]);   // badge HTML, nilainya dari daftar tetap
    document.getElementById("employeeDetailName").textContent = r.nama_keluarga;
    document.getElementById("employeeDetailSubtitle").textContent = `${r.status} · Periode ${r.periode}`;
    document.getElementById("employeeDetailInfo").innerHTML = info.map(([label, html]) => `<div><dt>${label}</dt><dd>${html}</dd></div>`).join("");
    document.getElementById("employeeDetailPeriod").textContent = `Januari sd ${r.periode}`;
    const history = document.getElementById("employeeDetailHistory");
    history.innerHTML = '<tr><td colspan="5" class="pantau-empty-state">Memuat riwayat...</td></tr>';
    pantauOpenDetailModal("employeeDetailDialog");
    history.dataset.noka = r.noka_keluarga;
    let data;
    try {
        data = await employeeApi("/api/karyawan/riwayat", { noka: r.noka_keluarga, bulan: r.bulan });
    } catch (error) {
        data = { error };
    }
    if (!data || history.dataset.noka !== r.noka_keluarga) return;   // popup sudah dibuka untuk orang lain
    history.innerHTML = data.error
        ? `<tr><td colspan="5" class="pantau-empty-state">Gagal memuat riwayat: ${escapeHtml(data.error.message)}</td></tr>`
        : data.rows.map(h => `<tr><td>${escapeHtml(h.bulan)}</td><td class="text-center">${Number(h.bulan_menunggak).toLocaleString("id-ID")}</td>
            <td class="text-right">${employeeCurrency.format(h.nominal_tagihan)}</td><td>${employeeDate(h.tanggal_bayar)}</td>
            <td class="text-right">${employeePaid(h)}</td></tr>`).join("") || '<tr><td colspan="5" class="pantau-empty-state">Belum ada riwayat sampai bulan ini.</td></tr>';
}
