// Navigasi menu admin: setiap jenis data (Tagihan, Pembayaran) punya sub menu Upload, Workspace, Riwayat.
// Setiap halaman & menu selalu dimulai dari atas: matikan pemulihan posisi scroll bawaan browser (reload/kembali).
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("pageshow", () => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
const ADMIN_JENIS = { tagihan: "Tagihan", pembayaran: "Pembayaran" };
let activeAdminPage = "upload";
let activeAdminJenis = "tagihan";

const ADMIN_PAGE_LOADERS = {
    upload: () => initUpload(),
    workspace: () => initWorkspace(),
    riwayat: () => loadHistory(),
};

async function showAdminPage(page, jenis = activeAdminJenis) {
    const leavingWorkspace = activeAdminPage === "workspace" && (page !== "workspace" || jenis !== activeAdminJenis);
    if (leavingWorkspace && hasUnsavedWorkspace() && !(await pantauConfirm({
        title: "Pindah menu tanpa menyimpan?", message: "Perubahan di workspace belum disimpan dan akan hilang.", tone: "danger", confirmText: "Buang perubahan", cancelText: "Tetap di sini",
    }))) return;
    activeAdminPage = page;
    activeAdminJenis = jenis;
    document.querySelectorAll(".admin-page").forEach(section => section.classList.toggle("hidden", section.id !== `page-${page}`));
    document.querySelectorAll(".admin-nav").forEach(button =>
        button.classList.toggle("pantau-sidebar-active", button.dataset.nav === page && button.dataset.jenis === jenis));
    document.querySelectorAll("[data-jenis-label]").forEach(element => { element.textContent = ADMIN_JENIS[jenis]; });
    window.scrollTo({ top: 0, behavior: "auto" });
    ADMIN_PAGE_LOADERS[page]?.();
}
