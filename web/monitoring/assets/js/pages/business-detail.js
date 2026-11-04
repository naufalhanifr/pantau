// Popup Detail Badan Usaha.
function openBusinessDetail(kodeBU) {
    const allBusinesses = PANTAU_DATA;
    const business = allBusinesses.find(item => String(item.kode_bu) === String(kodeBU));
    if (!business) return;

    const filters = selectedFilters("monitoring");
    const startMonth = Math.max(1, Number(filters.startMonth || 1));
    const endMonth = Number(filters.month);
    const monthlyRows = [];
    for (let month = startMonth; month <= endMonth; month++) {
        const row = getMonthRows(month, Number(filters.year), "").find(item => String(item.kode_bu) === String(kodeBU));
        if (row) monthlyRows.push(row);
    }
    // Ringkasan memakai aturan yang sama dengan baris tabel: tagihan & sisa posisi bulan akhir, pembayaran dijumlah.
    const summary = getFilteredRows("monitoring").find(item => String(item.kode_bu) === String(kodeBU)) || { tagihan: 0, bayar: 0, sisa: 0 };

    const periodLabel = startMonth === endMonth
        ? `${MONTHS[startMonth - 1]} ${filters.year}`
        : `${MONTHS[startMonth - 1]} sd ${MONTHS[endMonth - 1]} ${filters.year}`;
    document.getElementById("businessDetailTitle").textContent = business.nama_bu;
    document.getElementById("businessDetailCode").textContent = `Kode BU: ${business.kode_bu}`;
    document.getElementById("businessDetailTagihan").textContent = formatRupiah(summary.tagihan);
    document.getElementById("businessDetailBayar").textContent = formatRupiah(summary.bayar);
    document.getElementById("businessDetailSisa").textContent = formatRupiah(summary.sisa);
    document.getElementById("businessDetailPeriod").textContent = `Periode ${periodLabel}`;

    const history = document.getElementById("businessDetailHistory");
    history.innerHTML = "";
    if (!monthlyRows.length) {
        history.innerHTML = '<tr><td colspan="4" class="px-3 py-8 text-center text-slate-500">Tidak ada riwayat pada periode ini.</td></tr>';
    } else {
        monthlyRows.forEach(row => {
            const tr = document.createElement("tr");
            tr.className = "hover:bg-slate-50/80 transition";
            tr.innerHTML = `<td class="font-medium text-slate-700">${MONTHS[row.month - 1]}</td><td class="text-right font-semibold text-indigo-600 tabular-nums">${formatRupiah(row.tagihan)}</td><td class="text-right font-semibold text-emerald-700 tabular-nums">${formatRupiah(row.bayar)}</td><td class="text-right font-semibold text-rose-600 tabular-nums">${formatRupiah(row.sisa ?? Math.max(0, Number(row.tagihan || 0) - Number(row.bayar || 0)))}</td>`;
            history.appendChild(tr);
        });
    }

    pantauOpenDetailModal("businessDetailModal");
}
