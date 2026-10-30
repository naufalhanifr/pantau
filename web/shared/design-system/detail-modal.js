// Design system: popup detail berisi ringkasan + tabel (gaya di detail-modal.css).
// Markup:
// <dialog class="pantau-detail-modal" id="..." aria-labelledby="judulId">
//   <div class="pantau-detail-modal-header">
//     <div class="pantau-detail-modal-heading"><h2 class="pantau-detail-modal-title" id="judulId">…</h2><p class="pantau-detail-modal-subtitle">…</p></div>
//     <button class="pantau-detail-modal-close" type="button" aria-label="Tutup detail" data-modal-close><i class="fa-solid fa-xmark"></i></button>
//   </div>
//   <div class="pantau-detail-modal-body">
//     …isi bebas…
//     <section class="pantau-detail-modal-section">
//       <div class="pantau-detail-modal-section-head"><h3>Judul tabel</h3><p>Periode …</p></div>
//       <div class="pantau-table-scroll"><table class="pantau-table">…</table></div>
//     </section>
//   </div>
//   <div class="pantau-detail-modal-footer"><button class="pantau-detail-modal-btn" type="button" data-modal-close>Tutup</button></div>
// </dialog>
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
