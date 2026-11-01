// Design system: popup detail <dialog class="pantau-detail-modal"> (gaya di detail-modal.css; contoh markup: partials/business-detail-modal.html).
// Buka dengan pantauOpenDetailModal(id). Esc, klik di luar popup, dan tombol [data-modal-close] menutupnya.
function pantauOpenDetailModal(id) {
    const dialog = document.getElementById(id);
    if (!dialog || dialog.open) return;
    document.body.classList.add("pantau-modal-open");
    dialog.showModal();
}

document.addEventListener("click", event => {
    const dialog = event.target.closest?.(".pantau-detail-modal");
    // Klik pada backdrop menghasilkan target = elemen <dialog> itu sendiri.
    if (dialog && (event.target === dialog || event.target.closest("[data-modal-close]"))) dialog.close();
});

// Event close tidak bubble, jadi ditangkap di fase capture untuk melepas kunci scroll.
document.addEventListener("close", event => {
    if (event.target.classList?.contains("pantau-detail-modal")) document.body.classList.remove("pantau-modal-open");
}, true);
