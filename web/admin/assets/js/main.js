// Inisialisasi web admin.
document.addEventListener("DOMContentLoaded", () => {
    initUploadDropzone();
    if (getAdminToken()) {
        showAdminApp();
        showAdminPage("upload", "tagihan");
    } else {
        showAdminLogin();
    }
});
