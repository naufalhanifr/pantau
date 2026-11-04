// Dashboard: filter periode, kartu ringkasan, dan tabel peringkat tertinggi.
const TOP_TABLE_PAGE_SIZE = 5;
const topTables = { tagihan: { rows: [], page: 1 }, bayar: { rows: [], page: 1 } };
let dashboardTab = "bu";   // bu | pn

// Tab PPU BU / PPU PN. Data PN dimuat saat tab dibuka, memakai ringkasan yang sama dengan menu SKPD.
function showDashboardTab(tab) {
    dashboardTab = tab;
    document.querySelectorAll("[data-dashboard-tab]").forEach(el => el.classList.toggle("hidden", el.dataset.dashboardTab !== tab));
    document.querySelectorAll("[data-dashboard-tab-btn]").forEach(button => {
        const active = button.dataset.dashboardTabBtn === tab;
        button.classList.toggle("pantau-green-active", active);
        button.setAttribute("aria-pressed", active);
    });
    if (tab === "pn") showPpuPage("dashboard");
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

// Rentang filter Dashboard dengan label "Maret 2026" atau "Januari sd Maret 2026".
function dashboardPeriod() {
    const f = selectedFilters("dashboard");
    const end = Number(f.month), year = Number(f.year);
    const start = Math.min(Number(f.startMonth) || end, end);
    const label = start === end ? `${MONTHS[end - 1]} ${year}` : `${MONTHS[start - 1]} sd ${MONTHS[end - 1]} ${year}`;
    return { start, end, year, label };
}

function updateDashboardPeriodLabels() {
    const { end, year, label } = dashboardPeriod();
    setText("pagePeriodLabel", label);
    setText("topTagihanPeriodDescription", `Nilai nominal tagihan tertinggi ${label}`);
    setText("topBayarPeriodDescription", `Nilai nominal pembayaran tertinggi ${label}`);
    setText("labelPeriodeTagihan", `${MONTHS[end - 1]} ${year}`);
    setText("labelPeriodeBayar", label);
    setText("labelPeriodeSisa", label);
    return label;
}

function handleGlobalFilter() {
    // Hindari rentang terbalik dengan menggeser batas awal mengikuti bulan akhir.
    const start = document.getElementById("globalStartMonth");
    const end = document.getElementById("globalMonth");
    if (Number(start.value) > Number(end.value)) start.value = end.value;
    const period = updateDashboardPeriodLabels();
    // Filter Dashboard berdiri sendiri; jangan sinkronkan ke kontrol Monitoring.
    clearTimeout(globalFilterTimer);
    globalFilterTimer = setTimeout(async () => {
        currentPage = 1;
        dismissNotice("errorNotice");
        dismissNotice("successNotice");
        try {
            await loadDashboardSummary();
            showSuccess(`Filter berhasil diterapkan untuk periode ${period}.`);
        } catch (error) { showError(`Filter gagal diterapkan: ${error.message}`); }
    }, 250);
}

async function loadDashboardSummary() {
    const rows = getFilteredRows("dashboard");
    const total = key => rows.reduce((sum, r) => sum + Number(r[key] || 0), 0);
    const amount = value => `<span class="block text-base font-semibold">Rp</span><span class="block">${value.toLocaleString("id-ID")}</span>`;
    document.getElementById("cardTotalTagihan").innerHTML = amount(total("tagihan"));
    document.getElementById("cardTotalBayar").innerHTML = amount(total("bayar"));
    document.getElementById("cardSisaTagihan").innerHTML = amount(total("sisa"));
    updateDashboardPeriodLabels();
    topTables.tagihan = { rows: [...rows].sort((a, b) => b.sisa - a.sisa).slice(0, 10), page: 1 };
    topTables.bayar = { rows: [...rows].sort((a, b) => b.bayar - a.bayar).slice(0, 10), page: 1 };
    renderTopTable("tagihan");
    renderTopTable("bayar");
    renderTrendChart();
}

function goTopTablePage(type, page) {
    topTables[type].page = page;
    renderTopTable(type);
}

function renderTopTable(type) {
    const { rows, page } = topTables[type];
    const id = type === "bayar" ? "topBayar" : "topTagihan";
    const from = (page - 1) * TOP_TABLE_PAGE_SIZE;
    const visible = rows.slice(from, from + TOP_TABLE_PAGE_SIZE);
    // Padding, warna kolom nominal, dan empty state mengikuti .pantau-table (design system).
    document.getElementById(`${id}Body`).innerHTML = visible.length
        ? visible.map((item, i) => `<tr class="transition"><td>${from + i + 1}</td><td>${escapeHtml(item.kode_bu || "-")}</td><td>${escapeHtml(item.nama_bu || "-")}</td>
            <td class="text-right">${formatRupiah(item.tagihan)}</td><td class="text-right">${formatRupiah(item.bayar)}</td><td class="text-right">${formatRupiah(Number(item.sisa || 0))}</td></tr>`).join("")
        : '<tr><td colspan="6" class="pantau-empty-state">Tidak ada badan usaha pada periode ini. Ubah rentang bulan untuk melihat data lain.</td></tr>';
    const pages = Math.max(1, Math.ceil(rows.length / TOP_TABLE_PAGE_SIZE));
    // Footer tetap tampil (info + halaman 1) walau hasil filter kosong.
    document.getElementById(`${id}Pagination`).innerHTML =
        `<div class="text-xs text-slate-500">${rows.length ? `Menampilkan ${from + 1}-${from + visible.length} dari ${rows.length} data` : "Menampilkan 0 dari 0 data"}</div>` +
        `<div class="flex items-center gap-1.5">${pantauPagination(page, pages, n => `goTopTablePage('${type}', ${n})`, { edges: false })}</div>`;
}
