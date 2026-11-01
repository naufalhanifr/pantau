// Inisialisasi web admin.
document.addEventListener("DOMContentLoaded", () => {
    // Di production admin punya domain sendiri (admin.pantau-bekasi.com), dan "/" di sana adalah halaman admin.
    if (location.hostname.startsWith("admin.")) document.getElementById("monitoringLink").href = `${location.protocol}//${location.host.slice(6)}/`;
    initUploadDropzone();
    if (getAdminToken()) {
        showAdminApp();
        showAdminPage("upload", "tagihan");
    } else {
        showAdminLogin();
    }
});
