// Navigasi menu sidebar dan ciutkan/perluas sidebar.
// Setiap halaman & menu selalu dimulai dari atas: matikan pemulihan posisi scroll bawaan browser (reload/kembali).
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("pageshow", () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
function showPage(page) {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    activePage = page;
    if (page === "dashboard") { dismissNotice("monitorErrorNotice"); dismissNotice("monitorSuccessNotice"); }
    else { dismissNotice("errorNotice"); dismissNotice("successNotice"); }
    document.getElementById("dashboardPage")?.classList.toggle("hidden", page !== "dashboard");
    document.getElementById("monitoringPage")?.classList.toggle("hidden", page !== "monitoring");
    document.getElementById("employeesPage")?.classList.toggle("hidden", page !== "employees");
    document.querySelectorAll(".sidebar-nav").forEach(button => {
        const active = button.dataset.nav === page;
        button.classList.toggle("pantau-sidebar-active", active);
        button.classList.toggle("text-slate-600", !active);
        button.classList.toggle("hover:bg-slate-50", !active);
    });
    if (page === "monitoring") loadRecords();
    if (page === "employees") renderEmployeeTable();
}

function toggleSidebar() {
    const sidebar = document.getElementById("appSidebar");
    const collapsed = sidebar.classList.toggle("sidebar-collapsed");
    document.body.classList.toggle("sidebar-is-collapsed", collapsed);
    document.body.classList.toggle("sidebar-is-expanded-mobile", !collapsed && window.innerWidth <= 640);
    // CSS class controls width and content offset together.
    document.querySelectorAll("#appSidebar .nav-label, #appSidebar .nav-footnote").forEach(el => el.classList.toggle("hidden", collapsed));
    const toggle = document.getElementById("sidebarToggle");
    toggle.innerHTML = collapsed ? '<i class="fa-solid fa-angles-right w-5 text-center shrink-0"></i>' : '<i class="fa-solid fa-angles-left w-5 text-center shrink-0"></i><span id="sidebarToggleLabel">Sembunyikan</span>';
    toggle.classList.toggle("justify-center", collapsed);
    toggle.classList.toggle("justify-start", !collapsed);
    toggle.setAttribute("aria-label", collapsed ? "Perluas sidebar" : "Ciutkan sidebar");
    document.querySelectorAll(".sidebar-nav").forEach(el => el.classList.toggle("justify-center", collapsed));
}
