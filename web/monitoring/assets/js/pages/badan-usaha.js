// Daftar Badan Usaha: filter, pencarian, tabel, urutan, dan pagination.
// Bulan yang belum tersedia datanya tidak dapat dipilih. Dataset saat ini tersedia sampai September 2026.
function syncMonitoringMonthFilter() {
    const start = document.getElementById("monitorStartMonth");
    const end = document.getElementById("monitorEndMonth");
    if (!start || !end) return;
    let a = Number(start.value || 9), b = Number(end.value || 9);
    if (a > b) { a = b; start.value = String(a); }
    const period = a === b ? `${DEMO_MONTHS[b - 1]} 2026` : `${DEMO_MONTHS[a - 1]} sd ${DEMO_MONTHS[b - 1]} 2026`;
    const label = document.getElementById("monitoringPeriodLabel");
    if (label) label.textContent = period;
    clearTimeout(monitoringFilterTimer);
    monitoringFilterTimer = setTimeout(async () => {
        currentPage = 1;
        dismissNotice("monitorErrorNotice"); dismissNotice("monitorSuccessNotice");
        try { await loadRecords(); showSuccess(`Filter Monitoring berhasil diterapkan untuk periode ${period}.`); }
        catch (error) { showError(`Filter Monitoring gagal diterapkan: ${error.message}`); }
    }, 200);
}

function handleMonitoringSearch() {
    if (activePage !== "monitoring") return;
    clearTimeout(monitoringFilterTimer);
    monitoringFilterTimer = setTimeout(async () => {
        currentPage = 1;
        dismissNotice("monitorErrorNotice"); dismissNotice("monitorSuccessNotice");
        try { await loadRecords(); showSuccess("Pencarian Monitoring berhasil diterapkan."); }
        catch (error) { showError(`Pencarian Monitoring gagal: ${error.message}`); }
    }, 250);
}

async function loadRecords() {
    const f = selectedFilters("monitoring");
    let rows = getFilteredRows("monitoring");
    const sortMap = { no: "no", kode: "kode_bu", nama: "nama_bu", tagihan: "tagihan", bayar: "bayar", sisa: "sisa" };
    if (!currentSortCol) {
        rows.sort((a, b) => Number(b.sisa || 0) - Number(a.sisa || 0));
    } else {
        const key = sortMap[currentSortCol];
        rows.sort((a,b) => {
            const av = a[key], bv = b[key];
            const cmp = typeof av === "string" ? av.localeCompare(bv, "id") : av - bv;
            return currentSortAsc ? cmp : -cmp;
        });
    }
    updateSortIndicators();
    totalRecords = rows.length;
    totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    renderTable(pageRows);
    const count = document.getElementById("tableRecordCount");
    if (count) count.innerText = `${totalRecords.toLocaleString("id-ID")} badan usaha ditemukan`;
    const info = document.getElementById("paginationInfo");
    if (info) info.innerText = totalRecords === 0 ? "Menampilkan 0 dari 0 data" : `Menampilkan ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, totalRecords)} dari ${totalRecords.toLocaleString("id-ID")} data`;
    renderPaginationControls();
}

function renderTable(rows) {
    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = "";

    if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="px-3 py-8 text-center text-slate-400">Tidak ada data yang cocok.</td></tr>';
        return;
    }

    rows.forEach((item, index) => {
        const tr = document.createElement("tr");
        tr.className = "hover:bg-slate-50/80 transition";
        const rowNo = (currentPage - 1) * pageSize + index + 1;
        tr.innerHTML = `
            <td class="px-3 py-3 text-slate-400 font-medium">${rowNo.toLocaleString("id-ID")}</td>
            <td class="px-3 py-3 font-mono text-xs font-semibold text-slate-600">${escapeHtml(item.kode_bu ?? item["Kode BU"] ?? "-")}</td>
            <td class="px-3 py-3 font-semibold text-slate-900">${escapeHtml(item.nama_bu ?? item["Nama BU"] ?? "-")}</td>
            <td class="px-3 py-3 text-right font-medium text-indigo-600">${formatRupiah(item.tagihan ?? item["Total Tagihan (September 2026)"])}</td>
            <td class="px-3 py-3 text-right font-medium text-emerald-600">${formatRupiah(item.bayar ?? item["Total Bayar (September 2026)"])}</td>
            <td class="px-3 py-3 text-right font-medium text-rose-600">${formatRupiah(Number(item.sisa ?? Math.max(0, Number(item.tagihan ?? item["Total Tagihan (September 2026)"] ?? 0) - Number(item.bayar ?? item["Total Bayar (September 2026)"] ?? 0))))}</td>
            <td class="px-3 py-3 text-center"><button type="button" data-detail-code="${escapeHtml(item.kode_bu ?? item["Kode BU"] ?? "")}" class="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition" onclick="openBusinessDetail(this.dataset.detailCode)"><i class="fa-regular fa-eye"></i><span>Detail</span></button></td>`;
        tbody.appendChild(tr);
    });
}

function renderPaginationControls() {
    document.getElementById("paginationControls").innerHTML = pantauPagination(currentPage, totalPages, page => `goMonitoringPage(${page})`);
}

async function goMonitoringPage(page) {
    currentPage = page;
    await loadRecords();
}

async function changePageSize() {
    pageSize = parseInt(document.getElementById("pageSizeSelect").value, 10) || 25;
    currentPage = 1;
    try {
        await loadRecords();
    } catch (error) {
        showError(`Gagal mengganti jumlah data: ${error.message}`);
    }
}

function updateSortIndicators() {
    document.querySelectorAll('#monitoringTableScroll th[data-sort-column]').forEach(th => {
        const column = th.dataset.sortColumn;
        const icon = th.querySelector('.column-sort-btn i');
        const active = currentSortCol === column;
        th.classList.toggle('is-sort-asc', active && currentSortAsc === true);
        th.classList.toggle('is-sort-desc', active && currentSortAsc === false);
        if (icon) {
            icon.className = !active ? 'fa-solid fa-sort' : (currentSortAsc ? 'fa-solid fa-sort-up' : 'fa-solid fa-sort-down');
        }
        th.setAttribute('aria-sort', !active ? 'none' : (currentSortAsc ? 'ascending' : 'descending'));
        th.title = !active ? 'Klik untuk urutkan' : (currentSortAsc ? 'Urutan terendah ke tertinggi' : 'Urutan tertinggi ke terendah');
    });
}

async function sortTable(column) {
    if (currentSortCol !== column) {
        currentSortCol = column;
        currentSortAsc = true;
    } else if (currentSortAsc === true) {
        currentSortAsc = false;
    } else {
        currentSortCol = null;
        currentSortAsc = null;
    }
    currentPage = 1;
    updateSortIndicators();
    try {
        await loadRecords();
    } catch (error) {
        showError(`Pengurutan gagal: ${error.message}`);
    }
}
