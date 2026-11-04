// Navigasi menu sidebar. Ciutkan/perluas sidebar ada di design system (app-shell.js).
function showPage(page) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    activePage = page;
    if (page === "dashboard") { dismissNotice("monitorErrorNotice"); dismissNotice("monitorSuccessNotice"); }
    else { dismissNotice("errorNotice"); dismissNotice("successNotice"); }
    document.getElementById("dashboardPage")?.classList.toggle("hidden", page !== "dashboard");
    document.getElementById("monitoringPage")?.classList.toggle("hidden", page !== "monitoring");
    document.getElementById("employeesPage")?.classList.toggle("hidden", page !== "employees");
    const ppu = page.startsWith("ppu-");
    document.getElementById("ppuPage")?.classList.toggle("hidden", !ppu);
    // Satu kartu login untuk Daftar Karyawan dan PPU PN: pindahkan ke menu yang dibuka.
    if (page === "employees" || ppu) document.getElementById(ppu ? "ppuPage" : "employeesPage").prepend(document.getElementById("employeeLoginPanel"));
    document.querySelectorAll(".pantau-sidebar-nav").forEach(button => button.classList.toggle("pantau-sidebar-active", button.dataset.nav === page));
    if (page === "monitoring") loadRecords();
    if (page === "employees") showEmployeesPage();
    if (ppu) showPpuPage(page.slice(4));
}
