// Popup Detail Badan Usaha.
function openBusinessDetail(kodeBU) {
    const allBusinesses = PANTAU_DATA;
    const business = allBusinesses.find(item => String(item.kode_bu) === String(kodeBU));
    if (!business) return;

    const filters = selectedFilters("monitoring");
    const startMonth = Math.max(1, Number(filters.startMonth || 1));
    const endMonth = Math.min(9, Number(filters.month || 9));
    const monthlyRows = [];
    let totalTagihan = 0, totalBayar = 0, totalSisa = 0;

    for (let month = startMonth; month <= endMonth; month++) {
        const row = getDemoRows(month, Number(filters.year || 2026), "").find(item => String(item.kode_bu) === String(kodeBU));
        if (!row) continue;
        monthlyRows.push(row);
        totalTagihan += Number(row.tagihan || 0);
        totalBayar += Number(row.bayar || 0);
        totalSisa += Number(row.sisa || 0);
    }

    const periodLabel = startMonth === endMonth
        ? `${DEMO_MONTHS[startMonth - 1]} ${filters.year}`
        : `${DEMO_MONTHS[startMonth - 1]}–${DEMO_MONTHS[endMonth - 1]} ${filters.year}`;
    document.getElementById("businessDetailTitle").textContent = business.nama_bu;
    document.getElementById("businessDetailCode").textContent = `Kode BU: ${business.kode_bu}`;
    document.getElementById("businessDetailTagihan").textContent = formatRupiah(totalTagihan);
    document.getElementById("businessDetailBayar").textContent = formatRupiah(totalBayar);
    document.getElementById("businessDetailSisa").textContent = formatRupiah(totalSisa);
    document.getElementById("businessDetailPeriod").textContent = `Periode ${periodLabel}`;

    const history = document.getElementById("businessDetailHistory");
    history.innerHTML = "";
    if (!monthlyRows.length) {
        history.innerHTML = '<tr><td colspan="4" class="px-3 py-8 text-center text-slate-400">Tidak ada riwayat pada periode ini.</td></tr>';
    } else {
        monthlyRows.forEach(row => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-50/80 transition";
            tr.innerHTML = `<td class="font-medium text-slate-700">${DEMO_MONTHS[row.month - 1]}</td><td class="text-right font-semibold text-indigo-600 tabular-nums">${formatRupiah(row.tagihan)}</td><td class="text-right font-semibold text-emerald-600 tabular-nums">${formatRupiah(row.bayar)}</td><td class="text-right font-semibold text-rose-600 tabular-nums">${formatRupiah(row.sisa ?? Math.max(0, Number(row.tagihan || 0) - Number(row.bayar || 0)))}</td>`;
            history.appendChild(tr);
        });
    }

    pantauOpenDetailModal("businessDetailModal");
}
