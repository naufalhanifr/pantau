// Dashboard: filter periode, kartu ringkasan, dan tabel peringkat tertinggi.
function updateTop5PeriodDescriptions() {
    const startSelect = document.getElementById("globalStartMonth");
    const endSelect = document.getElementById("globalMonth");
    if (!startSelect || !endSelect) return;
    const start = Number(startSelect.value);
    const end = Number(endSelect.value);
    const startName = startSelect.querySelector(`option[value="${start}"]`)?.textContent || "";
    const endName = endSelect.querySelector(`option[value="${end}"]`)?.textContent || "";
    const year = 2026;
    const period = start === end ? `${endName} ${year}` : `${startName} sd ${endName} ${year}`;
    const tagihan = document.getElementById("topTagihanPeriodDescription");
    const bayar = document.getElementById("topBayarPeriodDescription");
    if (tagihan) tagihan.textContent = `Nilai nominal tagihan tertinggi ${period}`;
    if (bayar) bayar.textContent = `Nilai nominal pembayaran tertinggi ${period}`;
}

function handleGlobalFilter() {
    updateTop5PeriodDescriptions();
    const f = selectedFilters();
    const startSelect = document.getElementById("globalStartMonth");
    const endSelect = document.getElementById("globalMonth");
    let start = Number(f.startMonth), end = Number(f.month);
    // Hindari rentang terbalik dengan menggeser batas awal mengikuti bulan akhir.
    if (start > end) { start = end; if (startSelect) startSelect.value = String(start); }
    const startName = startSelect?.querySelector(`option[value="${start}"]`)?.textContent || "";
    const endName = endSelect?.querySelector(`option[value="${end}"]`)?.textContent || "";
    const period = start === end ? `${endName} ${f.year}` : `${startName} sd ${endName} ${f.year}`;
    const note = document.getElementById("globalFilterNote");
    if (note) note.textContent = `Periode aktif: ${period}${f.search ? ` · Pencarian: ${f.search}` : ""}`;
    const pagePeriod = document.getElementById("pagePeriodLabel");
    if (pagePeriod) pagePeriod.textContent = period;
    // Filter Dashboard berdiri sendiri; jangan sinkronkan ke kontrol Monitoring.
    clearTimeout(globalFilterTimer);
    globalFilterTimer = setTimeout(async () => {
        currentPage = 1;
        document.getElementById("errorNotice")?.classList.add("hidden");
        document.getElementById("successNotice")?.classList.add("hidden");
        try {
            await loadDashboardSummary();
            showSuccess(`Filter berhasil diterapkan untuk periode ${period}.`);
        } catch (error) { showError(`Filter gagal diterapkan: ${error.message}`); }
    }, 250);
}

function updateCards(rows, month, year) {
    const totalBU = rows.length;
    const totalTagihan = rows.reduce((sum, r) => sum + Number(r.tagihan || 0), 0);
    const totalBayar = rows.reduce((sum, r) => sum + Number(r.bayar || 0), 0);
    const sisaTagihan = rows.reduce((sum, r) => sum + Number(r.sisa || 0), 0);
    const activeFilters = selectedFilters("dashboard");
    const startMonth = Number(activeFilters.startMonth || month);
    const period = startMonth === month ? `${DEMO_MONTHS[month - 1]} ${year}` : `${DEMO_MONTHS[startMonth - 1]} sd ${DEMO_MONTHS[month - 1]} ${year}`;
    const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    const setAmountCard = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = `<span class="block text-base font-semibold">Rp</span><span class="block">${Number(value || 0).toLocaleString("id-ID")}</span>`; };
    setAmountCard("cardTotalTagihan", totalTagihan);
    setAmountCard("cardTotalBayar", totalBayar);
    setAmountCard("cardSisaTagihan", sisaTagihan);
    setText("labelPeriodeTagihan", `${DEMO_MONTHS[month - 1]} ${year}`);
    setText("labelPeriodeBayar", period);
    setText("labelPeriodeSisa", period);
    renderCharts([...rows].sort((a,b)=>b.sisa-a.sisa).slice(0,10), [...rows].sort((a,b)=>b.bayar-a.bayar).slice(0,10));
    renderTrendChart({ rows: getDemoRows(month, year, activeFilters.search), month, year });
}

async function loadDashboardSummary() {
    const f = selectedFilters("dashboard");
    const rows = getFilteredRows("dashboard");
    updateCards(rows, Number(f.month), Number(f.year));
}

let topTagihanRows = [];
let topBayarRows = [];
let topTagihanPage = 1;
let topBayarPage = 1;
const TOP_TABLE_PAGE_SIZE = 5;

function renderTopPagination(type, rows, page) {
    const container = document.getElementById(type === "bayar" ? "topBayarPagination" : "topTagihanPagination");
    if (!container) return;
    container.innerHTML = "";
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / TOP_TABLE_PAGE_SIZE));
    const current = Math.min(page, pages);
    const from = total ? (current - 1) * TOP_TABLE_PAGE_SIZE + 1 : 0;
    const to = Math.min(current * TOP_TABLE_PAGE_SIZE, total);
    const info = document.createElement("div");
    info.className = "text-xs text-slate-500";
    info.textContent = total ? `Menampilkan ${from}–${to} dari ${total} data` : "Menampilkan 0 dari 0 data";
    container.appendChild(info);
    const controls = document.createElement("div");
    controls.className = "flex items-center gap-1.5";
    const addButton = (label, target, disabled, active = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.innerHTML = label;
        // Keep the active page visibly rendered; disabling the current page can
        // trigger browser/theme styles that make the number look missing.
        button.disabled = disabled && !active;
        button.className = `px-3 py-2 rounded-xl border text-xs font-medium transition ${active ? "pantau-green-active" : disabled ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"}`;
        button.style.setProperty("display", "inline-flex", "important");
        button.style.setProperty("align-items", "center", "important");
        button.style.setProperty("justify-content", "center", "important");
        button.style.setProperty("min-width", "32px", "important");
        button.style.setProperty("min-height", "32px", "important");
        button.style.setProperty("opacity", "1", "important");
        button.setAttribute("aria-label", `Halaman ${target}`);
        if (active) button.setAttribute("aria-current", "page");
        button.onclick = () => {
            if (type === "bayar") { topBayarPage = target; renderTopTable("topBayarBody", topBayarRows, topBayarPage, "bayar"); }
            else { topTagihanPage = target; renderTopTable("topTagihanBody", topTagihanRows, topTagihanPage, "tagihan"); }
        };
        controls.appendChild(button);
    };
    addButton('<i class="fa-solid fa-chevron-left text-xs"></i>', Math.max(1, current - 1), total === 0 || current === 1);
    // Keep page 1 visible even when filters return zero rows.
    for (let n = 1; n <= pages; n++) addButton(String(n), n, n === current, n === current);
    addButton('<i class="fa-solid fa-chevron-right text-xs"></i>', Math.min(pages, current + 1), total === 0 || current === pages);
    container.appendChild(controls);
}

function renderTopTable(bodyId, rows, page, type) {
    const tbody = document.getElementById(bodyId);
    if (!tbody) return;
    tbody.innerHTML = "";
    const start = (page - 1) * TOP_TABLE_PAGE_SIZE;
    const visibleRows = rows.slice(start, start + TOP_TABLE_PAGE_SIZE);
    if (!visibleRows.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-3 py-8 text-center text-slate-400">Tidak ada data yang cocok.</td></tr>';
    } else {
        visibleRows.forEach((item, index) => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-50/80 transition";
            tr.innerHTML = `<td class="px-3 py-3 text-slate-400 font-medium">${start + index + 1}</td>
              <td class="px-3 py-3 font-mono text-xs font-semibold text-slate-600">${escapeHtml(item.kode_bu || "-")}</td>
              <td class="px-3 py-3 font-semibold text-slate-900">${escapeHtml(item.nama_bu || "-")}</td>
              <td class="px-3 py-3 text-right font-medium text-indigo-600 bg-transparent">${formatRupiah(item.tagihan)}</td>
              <td class="px-3 py-3 text-right font-medium text-emerald-600 bg-transparent">${formatRupiah(item.bayar)}</td>
              <td class="px-3 py-3 text-right font-medium text-rose-600 bg-transparent">${formatRupiah(Number(item.sisa || 0))}</td>`;
            tbody.appendChild(tr);
        });
    }
    renderTopPagination(type, rows, page);
}

function renderCharts(topTagihan, topBayar) {
    topTagihanRows = topTagihan || [];
    topBayarRows = topBayar || [];
    topTagihanPage = 1;
    topBayarPage = 1;
    renderTopTable("topTagihanBody", topTagihanRows, topTagihanPage, "tagihan");
    renderTopTable("topBayarBody", topBayarRows, topBayarPage, "bayar");
}
