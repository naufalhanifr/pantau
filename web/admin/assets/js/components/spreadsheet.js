// Komponen spreadsheet (Tabulator): seleksi rentang, salin/tempel ala Excel, edit dengan klik dua kali.
const SPREADSHEET_OPTIONS = {
    layout: "fitColumns",
    renderVertical: "virtual",
    selectableRange: 1,
    selectableRangeColumns: true,
    selectableRangeRows: true,
    selectableRangeClearCells: true,
    // Jangan fokus otomatis ke sel pertama setelah data dimuat: fokus itu menggulir halaman ke tabel.
    selectableRangeAutoFocus: false,
    editTriggerEvent: "dblclick",
    clipboard: true,
    clipboardCopyStyled: false,
    clipboardCopyConfig: { rowHeaders: false, columnHeaders: false },
    clipboardCopyRowRange: "range",
    clipboardPasteParser: "range",
    clipboardPasteAction: "range",
    rowHeader: { resizable: false, frozen: true, width: 52, hozAlign: "center", formatter: "rownum", editor: false, headerSort: false },
    columnDefaults: { headerSort: false, resizable: "header", editor: "input", minWidth: 90 },
    placeholder: "Tidak ada data yang cocok.",
};

// Kolom angka: tampil format Indonesia, isi tempelan "1.234.567" otomatis jadi angka.
function numberColumn(title, field, extra = {}) {
    return {
        title, field,
        hozAlign: "right",
        headerHozAlign: "right",
        mutator: value => parseAmount(value),
        formatter: cell => formatNumber(cell.getValue()),
        ...extra,
    };
}

function createSpreadsheet(element, columns, data, options = {}) {
    const table = new Tabulator(element, { ...SPREADSHEET_OPTIONS, columns, data, ...options });
    // Tabulator selalu memilih sel pertama setelah data dimuat; sembunyikan sampai pengguna benar-benar memilih sel.
    markSpreadsheetIdle(table);
    table.on("dataProcessed", () => markSpreadsheetIdle(table));
    table.on("cellEditing", () => table.element.classList.remove("spreadsheet-idle"));
    ["pointerdown", "keydown"].forEach(type =>
        table.element.addEventListener(type, () => table.element.classList.remove("spreadsheet-idle"), true));
    return table;
}

function markSpreadsheetIdle(table) {
    table.element.classList.add("spreadsheet-idle");
}

function hasSpreadsheetSelection(table) {
    return !table.element.classList.contains("spreadsheet-idle");
}
