// Notifikasi per menu. MONTHS, escapeHtml, dan formatRupiah ada di /shared/common.js.
function dismissNotice(id) { document.getElementById(id)?.classList.add("hidden"); }

function showError(message) {
    const monitoring = activePage === "monitoring";
    const successId = monitoring ? "monitorSuccessNotice" : "successNotice";
    const errorId = monitoring ? "monitorErrorNotice" : "errorNotice";
    const textId = monitoring ? "monitorErrorText" : "errorText";
    dismissNotice(successId);
    const box = document.getElementById(errorId); if (box) box.classList.remove("hidden");
    const text = document.getElementById(textId); if (text) text.innerText = message;
}

function showSuccess(message) {
    const monitoring = activePage === "monitoring";
    const errorId = monitoring ? "monitorErrorNotice" : "errorNotice";
    const successId = monitoring ? "monitorSuccessNotice" : "successNotice";
    const textId = monitoring ? "monitorSuccessText" : "successText";
    dismissNotice(errorId);
    const box = document.getElementById(successId); const text = document.getElementById(textId);
    if (text) text.innerText = message; if (box) box.classList.remove("hidden");
}
