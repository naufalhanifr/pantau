// Daftar Badan Usaha: filter, pencarian, tabel, urutan, dan pagination.
const MONITORING_SORT_KEYS = { no: "no", kode: "kode_bu", nama: "nama_bu", tagihan: "tagihan", bayar: "bayar", sisa: "sisa" };

// Filter & pencarian memakai debounce yang sama, lalu kembali ke halaman 1.
function applyMonitoringFilter(delay, successText, errorPrefix) {
    clearTimeout(monitoringFilterTimer);
    monitoringFilterTimer = setTimeout(async () => {
        currentPage = 1;
        dismissNotice("monitorErrorNotice"); dismissNotice("monitorSuccessNotice");
        try { await loadRecords(); showSuccess(successText); }
        catch (error) { showError(`${errorPrefix}: ${error.message}`); }
    }, delay);
}

// Bulan yang belum tersedia datanya tidak dapat dipilih (lihat period-filter.js & data.js).
function syncMonitoringMonthFilter() {
    const start = document.getElementById("monitorStartMonth");
    const end = document.getElementById("monitorEndMonth");
    let a = Number(start.value || 1), b = Number(end.value || PANTAU_LATEST_MONTH || 12);
    if (a > b) { a = b; start.value = String(a); }
    const period = a === b ? `${MONTHS[b - 1]} ${PANTAU_YEAR}` : `${MONTHS[a - 1]} sd ${MONTHS[b - 1]} ${PANTAU_YEAR}`;
    setText("monitoringPeriodLabel", period);
    applyMonitoringFilter(200, `Filter Monitoring berhasil diterapkan untuk periode ${period}.`, "Filter Monitoring gagal diterapkan");
}

function handleMonitoringSearch() {
    if (activePage !== "monitoring") return;
    applyMonitoringFilter(250, "Pencarian Monitoring berhasil diterapkan.", "Pencarian Monitoring gagal");
}

async function loadRecords() {
    const rows = getFilteredRows("monitoring");
    const key = MONITORING_SORT_KEYS[currentSortCol];
    if (!key) rows.sort((a, b) => b.sisa - a.sisa);
    else rows.sort((a, b) => {
        const cmp = typeof a[key] === "string" ? a[key].localeCompare(b[key], "id") : a[key] - b[key];
        return currentSortAsc ? cmp : -cmp;
    });
    updateSortIndicators();
    totalRecords = rows.length;
    totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const first = (currentPage - 1) * pageSize;
    renderTable(rows.slice(first, first + pageSize), first);
    setText("tableRecordCount", `${totalRecords.toLocaleString("id-ID")} badan usaha ditemukan`);
    setText("paginationInfo", totalRecords === 0 ? "Menampilkan 0 dari 0 data" : `Menampilkan ${first + 1}-${Math.min(first + pageSize, totalRecords)} dari ${totalRecords.toLocaleString("id-ID")} data`);
    document.getElementById("paginationControls").innerHTML = pantauPagination(currentPage, totalPages, page => `goMonitoringPage(${page})`);
}

// Warna kolom nominal, padding, dan font sel diatur oleh design system table.css.
function renderTable(rows, first) {
    document.getElementById("tableBody").innerHTML = !rows.length
        ? '<tr><td colspan="7" class="pantau-empty-state">Tidak ada badan usaha pada rentang bulan dan pencarian ini. Ubah filter untuk melihat data lain.</td></tr>'
        : rows.map((item, i) => `<tr class="transition">
            <td>${(first + i + 1).toLocaleString("id-ID")}</td>
            <td>${escapeHtml(item.kode_bu)}</td>
            <td>${escapeHtml(item.nama_bu)}</td>
            <td class="text-right">${formatRupiah(item.tagihan)}</td>
            <td class="text-right">${formatRupiah(item.bayar)}</td>
            <td class="text-right">${formatRupiah(item.sisa)}</td>
            <td class="text-center"><button type="button" data-detail-code="${escapeHtml(item.kode_bu)}" class="inline-flex min-h-[44px] items-center justify-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition" onclick="openBusinessDetail(this.dataset.detailCode)"><i class="fa-regular fa-eye"></i><span>Detail</span></button></td>
        </tr>`).join("");
}

async function goMonitoringPage(page) {
    currentPage = page;
    await loadRecords();
}

async function changePageSize() {
    pageSize = parseInt(document.getElementById("pageSizeSelect").value, 10) || 25;
    currentPage = 1;
    try { await loadRecords(); }
    catch (error) { showError(`Gagal mengganti jumlah data: ${error.message}`); }
}

function updateSortIndicators() {
    document.querySelectorAll("#monitoringTableScroll th[data-sort-column]").forEach(th => {
        const active = currentSortCol === th.dataset.sortColumn;
        const dir = !active ? null : currentSortAsc ? "asc" : "desc";
        th.classList.toggle("is-sort-asc", dir === "asc");
        th.classList.toggle("is-sort-desc", dir === "desc");
        th.querySelector(".column-sort-btn i").className = !dir ? "fa-solid fa-sort" : dir === "asc" ? "fa-solid fa-sort-up" : "fa-solid fa-sort-down";
        th.setAttribute("aria-sort", !dir ? "none" : dir === "asc" ? "ascending" : "descending");
        th.title = !dir ? "Klik untuk urutkan" : dir === "asc" ? "Urutan terendah ke tertinggi" : "Urutan tertinggi ke terendah";
    });
}

// Siklus klik: naik → turun → urutan bawaan (sisa tagihan terbesar).
async function sortTable(column) {
    if (currentSortCol !== column) { currentSortCol = column; currentSortAsc = true; }
    else if (currentSortAsc) currentSortAsc = false;
    else { currentSortCol = null; currentSortAsc = null; }
    currentPage = 1;
    try { await loadRecords(); }
    catch (error) { showError(`Pengurutan gagal: ${error.message}`); }
}
