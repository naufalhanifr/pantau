// Inisialisasi halaman monitoring.
async function loadData() {
    document.getElementById("loadingNotice")?.classList.add("hidden");
    document.getElementById("errorNotice")?.classList.add("hidden");
    document.getElementById("successNotice")?.classList.add("hidden");
    await loadDashboardSummary();
}

configureAvailableMonthOptions();
// Sinkronkan label periode awal agar langsung mencerminkan Januari sampai bulan terakhir tersedia.
(function initializeDefaultMonthRange() {
    const start = document.getElementById("globalStartMonth");
    const end = document.getElementById("globalMonth");
    const startName = start?.selectedOptions[0]?.textContent || "Januari";
    const endName = end?.selectedOptions[0]?.textContent || "September";
    const period = `${startName} sd ${endName} 2026`;
    const pagePeriod = document.getElementById("pagePeriodLabel");
    const note = document.getElementById("globalFilterNote");
    const monitoringPeriod = document.getElementById("monitoringPeriodLabel");
    if (pagePeriod) pagePeriod.textContent = period;
    if (note) note.textContent = `Periode: ${period}`;
    if (monitoringPeriod) monitoringPeriod.textContent = period;
    updateTop5PeriodDescriptions();
})();

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
