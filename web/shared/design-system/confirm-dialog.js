// Modal konfirmasi bersama (monitoring + admin), pengganti window.confirm().
// Pakai: if (!(await pantauConfirm({ title: "Hapus data?", message: "...", confirmText: "Hapus", tone: "danger" }))) return;
// Esc, klik di luar modal, dan tombol batal menghasilkan false.
const PANTAU_DIALOG_ICONS = { primary: "fa-circle-question", danger: "fa-triangle-exclamation" };

function pantauConfirm({ title = "Konfirmasi", message = "", confirmText = "Ya, lanjutkan", cancelText = "Batal", tone = "primary", icon } = {}) {
    const dialog = document.createElement("dialog");
    dialog.className = `pantau-dialog pantau-dialog-${tone}`;
    dialog.innerHTML = `
      <div class="pantau-dialog-body">
        <div class="pantau-dialog-icon"><i class="fa-solid ${icon || PANTAU_DIALOG_ICONS[tone] || PANTAU_DIALOG_ICONS.primary}"></i></div>
        <div>
          <h3 class="pantau-dialog-title"></h3>
          <p class="pantau-dialog-message"></p>
        </div>
      </div>
      <div class="pantau-dialog-actions">
        <button class="pantau-dialog-btn pantau-dialog-cancel" type="button" value="cancel"></button>
        <button class="pantau-dialog-btn pantau-dialog-confirm" type="button" value="confirm"></button>
      </div>`;
    dialog.querySelector(".pantau-dialog-title").textContent = title;
    dialog.querySelector(".pantau-dialog-message").textContent = message;
    dialog.querySelector(".pantau-dialog-cancel").textContent = cancelText;
    dialog.querySelector(".pantau-dialog-confirm").textContent = confirmText;
    document.body.appendChild(dialog);

    return new Promise(resolve => {
        dialog.addEventListener("click", event => {
            if (event.target === dialog) dialog.close("cancel");          // klik backdrop
            else if (event.target.closest("button")) dialog.close(event.target.closest("button").value);
        });
        dialog.addEventListener("close", () => {
            resolve(dialog.returnValue === "confirm");
            dialog.remove();
        });
        dialog.showModal();
        // Aksi berbahaya: fokus awal di Batal agar Enter tidak langsung menghapus.
        dialog.querySelector(tone === "danger" ? ".pantau-dialog-cancel" : ".pantau-dialog-confirm").focus();
    });
}
