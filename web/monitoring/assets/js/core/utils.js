// Utilitas format, escape HTML, dan notifikasi per menu.
function formatRupiah(number) {
    return "Rp " + (Number(number) || 0).toLocaleString("id-ID");
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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
