// Navigasi menu sidebar. Ciutkan/perluas sidebar ada di design system (app-shell.js).
function showPage(page) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    activePage = page;
    if (page === "dashboard") { dismissNotice("monitorErrorNotice"); dismissNotice("monitorSuccessNotice"); }
    else { dismissNotice("errorNotice"); dismissNotice("successNotice"); }
    document.getElementById("dashboardPage")?.classList.toggle("hidden", page !== "dashboard");
    document.getElementById("monitoringPage")?.classList.toggle("hidden", page !== "monitoring");
    document.getElementById("employeesPage")?.classList.toggle("hidden", page !== "employees");
    document.querySelectorAll(".pantau-sidebar-nav").forEach(button => button.classList.toggle("pantau-sidebar-active", button.dataset.nav === page));
    if (page === "monitoring") loadRecords();
    if (page === "employees") showEmployeesPage();
}
