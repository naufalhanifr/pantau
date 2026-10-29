// Inisialisasi halaman monitoring.
async function loadData() {
    document.getElementById("loadingNotice")?.classList.add("hidden");
    document.getElementById("errorNotice")?.classList.add("hidden");
    document.getElementById("successNotice")?.classList.add("hidden");
    await loadDashboardSummary();
}

configureAvailableMonthOptions();
// Label periode awal mengikuti rentang default (Januari sampai bulan terakhir tersedia).
setText("monitoringPeriodLabel", updateDashboardPeriodLabels());

document.addEventListener("DOMContentLoaded", async () => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    try {
        await initializePantauData();
        await loadData();
        await loadRecords();
    } catch (error) {
        showError(`Gagal memuat database PANTAU: ${error.message}. Pastikan backend aktif dan file pantau.db tersedia.`);
        const tbody = document.getElementById("tableBody");
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="px-3 py-8 text-center text-rose-500">Data tidak dapat dimuat dari database.</td></tr>';
    }
});
