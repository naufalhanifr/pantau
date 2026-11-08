// Inisialisasi halaman monitoring.
async function loadData() {
    document.getElementById("loadingNotice")?.classList.add("hidden");
    document.getElementById("errorNotice")?.classList.add("hidden");
    document.getElementById("successNotice")?.classList.add("hidden");
    await loadDashboardSummary();
}

document.addEventListener("DOMContentLoaded", async () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    try {
        await initializePantauData();
        // Label periode awal mengikuti rentang default dari data.js (bulan pertama sampai bulan terakhir yang ada datanya).
        setText("monitoringPeriodLabel", updateDashboardPeriodLabels());
        await loadData();
        await loadRecords();
    } catch (error) {
        // error.status ada = dari server; tidak ada = skrip halaman gagal (misalnya file grafik tidak termuat).
        showError(error.status !== undefined ? `Gagal memuat data PANTAU. ${error.message}` : "Halaman tidak termuat lengkap. Muat ulang halaman; bila tetap muncul, hubungi admin PANTAU.");
        [["tableBody", 7], ["topTagihanBody", 6], ["topBayarBody", 6]].forEach(([id, cols]) => {
            const tbody = document.getElementById(id);
            if (tbody) tbody.innerHTML = `<tr><td colspan="${cols}" class="px-3 py-8 text-center text-rose-600">Data tidak dapat dimuat dari database.</td></tr>`;
        });
    }
});
