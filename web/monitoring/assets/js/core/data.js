// Data PANTAU dari /api/data dan agregasi per periode.
// Database menyimpan bulan tanpa tahun: satu database = satu tahun. Ganti tahun: lihat README "Pergantian tahun".
const PANTAU_YEAR = 2026;
let PANTAU_DATA = [];
let PANTAU_READY = false;
let PANTAU_LATEST_MONTH = 0;   // bulan terakhir yang ada datanya (1-12), dibaca dari /api/data

async function initializePantauData() {
    const result = await apiGet("/api/data");
    PANTAU_DATA = Array.isArray(result.data) ? result.data : [];
    PANTAU_READY = true;
    const availableMonths = [...new Set(PANTAU_DATA.map(row => Number(row.month)))].sort((a,b) => a-b);
    const latest = PANTAU_LATEST_MONTH = availableMonths.length ? Math.max(...availableMonths) : 0;
    ["globalStartMonth", "globalMonth", "monitorStartMonth", "monitorEndMonth"].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        Array.from(select.options).forEach(option => { option.disabled = !availableMonths.includes(Number(option.value)); });
    });
    ["globalStartMonth", "monitorStartMonth"].forEach(id => { const el=document.getElementById(id); if(el) el.value=String(availableMonths[0] || 1); });
    ["globalMonth", "monitorEndMonth"].forEach(id => { const el=document.getElementById(id); if(el) el.value=String(latest || 1); });
    return result;
}

function getDemoRows(month = Number(selectedFilters().month), year = Number(selectedFilters().year), search = selectedFilters().search) {
    if (!PANTAU_READY || Number(year) !== PANTAU_YEAR) return [];
    const q = String(search || "").trim().toLocaleLowerCase("id-ID");
    return PANTAU_DATA.filter(row => Number(row.month) === Number(month) &&
        (!q || String(row.nama_bu).toLocaleLowerCase("id-ID").includes(q) || String(row.kode_bu).toLowerCase().includes(q)))
        .map((row, i) => ({...row, no: i + 1, year: Number(year), sisa: Math.max(0, Number(row.tagihan || 0) - Number(row.bayar || 0))}));
}

function getFilteredRows(menu = activePage) {
    const f = selectedFilters(menu);
    const start = Math.min(Number(f.startMonth || f.month), Number(f.month));
    const end = Number(f.month);
    if (!PANTAU_READY || Number(f.year) !== PANTAU_YEAR || !end || start > end) return [];

    // Daftar BU mengikuti pencarian dan rentang filter. Tagihan dan sisa adalah posisi bulan akhir,
    // sedangkan pembayaran merupakan akumulasi dari bulan awal sampai bulan akhir.
    const byBusiness = new Map();
    for (let m = start; m <= end; m++) {
        getDemoRows(m, Number(f.year), f.search).forEach(row => {
            const key = String(row.kode_bu);
            if (!byBusiness.has(key)) {
                byBusiness.set(key, {
                    ...row, month: end, year: Number(f.year),
                    tagihan: 0, bayar: 0, sisa: 0,
                    _endMonthTagihan: 0, _endMonthBayar: 0, _hasEndMonth: false
                });
            }
            const aggregate = byBusiness.get(key);
            aggregate.bayar += Number(row.bayar || 0);
            if (m === end) {
                aggregate._endMonthTagihan = Number(row.tagihan || 0);
                aggregate._endMonthBayar = Number(row.bayar || 0);
                aggregate._hasEndMonth = true;
                aggregate.nama_bu = row.nama_bu;
            }
        });
    }
    return [...byBusiness.values()].map((row, i) => {
        row.tagihan = row._hasEndMonth ? row._endMonthTagihan : 0;
        row.sisa = row._hasEndMonth ? Math.max(0, row._endMonthTagihan - row._endMonthBayar) : 0;
        delete row._endMonthTagihan;
        delete row._endMonthBayar;
        delete row._hasEndMonth;
        return {...row, no: i + 1};
    });
}
