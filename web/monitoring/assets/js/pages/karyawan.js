// Daftar Karyawan: filter badan usaha/status, pencarian, tabel, dan pagination.
let employeeCurrentPage = 1;
let employeePageSize = 10;
let employeeFilteredRecords = employeeRecords.slice();

function formatEmployeeCurrency(value) {
    return new Intl.NumberFormat("id-ID", {style:"currency", currency:"IDR", maximumFractionDigits:0}).format(Number(value || 0));
}
function getEmployeeBusinessNames() {
    const businesses = new Map();
    employeeRecords.forEach(r => {
        const name = String(r.namaBU || "").trim();
        if (name) businesses.set(name.toLocaleLowerCase("id-ID"), name);
    });
    return Array.from(businesses.values()).sort((a,b)=>a.localeCompare(b,"id-ID"));
}
function renderEmployeeBusinessOptions() {
    const dropdown = document.getElementById("employeeBusinessDropdown");
    const input = document.getElementById("employeeBusinessFilter");
    if (!dropdown || !input) return;
    const query = input.value.trim().toLocaleLowerCase("id-ID");
    const names = getEmployeeBusinessNames().filter(name => !query || name.toLocaleLowerCase("id-ID").includes(query));
    const selected = input.dataset.selectedBusiness || "";
    const rows = [{name:"", label:"Semua Badan Usaha", selected:!selected}, ...names.map(name=>({name,label:name,selected:name.toLocaleLowerCase("id-ID")===selected.toLocaleLowerCase("id-ID")}))];
    dropdown.innerHTML = rows.length ? rows.map(item => `<button type="button" role="option" aria-selected="${item.selected ? "true" : "false"}" class="employee-business-option pantau-dropdown-option${item.selected ? " selected" : ""}" data-business="${escapeHtml(item.name)}" onclick="selectEmployeeBusiness(this.dataset.business)">${escapeHtml(item.label)}${item.selected ? '<i class="fa-solid fa-check" aria-hidden="true"></i>' : ''}</button>`).join("") : '<div class="employee-business-empty">Badan usaha tidak ditemukan</div>';
}
function openEmployeeBusinessDropdown() {
    const dropdown = document.getElementById("employeeBusinessDropdown");
    const input = document.getElementById("employeeBusinessFilter");
    if (!dropdown || !input) return;
    renderEmployeeBusinessOptions();
    dropdown.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
}
function closeEmployeeBusinessDropdown() {
    const dropdown = document.getElementById("employeeBusinessDropdown");
    const input = document.getElementById("employeeBusinessFilter");
    if (dropdown) dropdown.classList.add("hidden");
    if (input) input.setAttribute("aria-expanded", "false");
}
function toggleEmployeeBusinessDropdown() {
    const dropdown = document.getElementById("employeeBusinessDropdown");
    if (!dropdown) return;
    if (dropdown.classList.contains("hidden")) { const input=document.getElementById("employeeBusinessFilter"); if(input) input.focus(); openEmployeeBusinessDropdown(); }
    else closeEmployeeBusinessDropdown();
}
function filterEmployeeBusinessOptions() { renderEmployeeBusinessOptions(); openEmployeeBusinessDropdown(); }
function selectEmployeeBusiness(name) {
    const input = document.getElementById("employeeBusinessFilter");
    if (!input) return;
    input.value = name || "";
    input.dataset.selectedBusiness = name || "";
    closeEmployeeBusinessDropdown();
    filterEmployees();
}
function handleEmployeeBusinessKeydown(event) {
    if (event.key === "Escape") { closeEmployeeBusinessDropdown(); return; }
    if (event.key === "Enter") {
        event.preventDefault();
        const first = document.querySelector("#employeeBusinessDropdown .employee-business-option");
        if (first) first.click();
    }
}
document.addEventListener("click", function(event) {
    const combo = document.getElementById("employeeBusinessCombo");
    if (combo && !combo.contains(event.target)) closeEmployeeBusinessDropdown();
});
function toggleEmployeeSimpleDropdown(id) {
    const combo = document.getElementById(id);
    if (!combo) return;
    const dropdown = combo.querySelector('.employee-simple-dropdown');
    const trigger = combo.querySelector('.employee-custom-select-trigger');
    const shouldOpen = dropdown && dropdown.classList.contains('hidden');
    document.querySelectorAll('#employeeFilters .employee-simple-dropdown, #employeesProtectedContent .employee-simple-dropdown').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.employee-custom-select-trigger').forEach(el => el.setAttribute('aria-expanded','false'));
    if (shouldOpen) { dropdown.classList.remove('hidden'); if (trigger) trigger.setAttribute('aria-expanded','true'); }
}
function chooseEmployeeSimpleOption(id, option) {
    const combo = document.getElementById(id);
    if (!combo || !option) return;
    const select = combo.querySelector('select') || (id === 'employeePageSizeCombo' ? document.getElementById('employeePageSize') : null);
    if (!select) return;
    select.value = option.dataset.value ?? '';
    const trigger = combo.querySelector('.employee-custom-select-trigger');
    if (trigger) trigger.querySelector('span').textContent = option.textContent.trim();
    combo.querySelectorAll('.employee-business-option').forEach(el => {
        const selected = el === option;
        el.classList.toggle('selected', selected);
        el.setAttribute('aria-selected', selected ? 'true' : 'false');
        const check = el.querySelector('i');
        if (check) check.remove();
        if (selected) el.insertAdjacentHTML('beforeend','<i class="fa-solid fa-check" aria-hidden="true"></i>');
    });
    const dropdown = combo.querySelector('.employee-simple-dropdown');
    if (dropdown) dropdown.classList.add('hidden');
    if (trigger) trigger.setAttribute('aria-expanded','false');
    if (id === 'employeePageSizeCombo') changeEmployeePageSize(); else filterEmployees();
}
function syncEmployeeCustomSelect(id, select) {
    const combo = document.getElementById(id);
    if (!combo || !select) return;
    const option = combo.querySelector(`.employee-business-option[data-value="${CSS.escape(select.value)}"]`);
    if (option) chooseEmployeeSimpleOption(id, option);
}
document.addEventListener('click', function(event) {
    if (!event.target.closest('.employee-custom-select')) {
        document.querySelectorAll('.employee-simple-dropdown').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.employee-custom-select-trigger').forEach(el => el.setAttribute('aria-expanded','false'));
    }
});

function filterEmployees() {
    const query = String(document.getElementById("employeeSearchInput")?.value || "").trim().toLocaleLowerCase("id-ID");
    const status = String(document.getElementById("employeeStatusFilter")?.value || "").trim().toLocaleLowerCase("id-ID");
    const businessInput = document.getElementById("employeeBusinessFilter");
    const business = String(businessInput?.dataset.selectedBusiness || "").trim().toLocaleLowerCase("id-ID");
    employeeFilteredRecords = employeeRecords.filter(r => {
        const searchable = [r.namaBU, r.kodeBU, r.namaPeserta, r.namaKeluarga, r.noJKN, r.noJKNKeluarga].join(" ").toLocaleLowerCase("id-ID");
        return (!query || searchable.includes(query)) &&
            (!status || String(r.status || "").toLocaleLowerCase("id-ID") === status) &&
            (!business || String(r.namaBU || "").toLocaleLowerCase("id-ID") === business);
    });
    employeeCurrentPage = 1;
    renderEmployeeTable();
}

function changeEmployeePageSize() {
    employeePageSize = Number(document.getElementById("employeePageSize")?.value || 10);
    employeeCurrentPage = 1;
    renderEmployeeTable();
}
function goEmployeePage(page) {
    const totalPages = Math.max(1, Math.ceil(employeeFilteredRecords.length / employeePageSize));
    employeeCurrentPage = Math.min(totalPages, Math.max(1, page));
    renderEmployeeTable();
}
function renderEmployeeTable() {
    const body = document.getElementById("employeeTableBody");
    if (!body) return;
    const total = employeeFilteredRecords.length;
    const pages = Math.max(1, Math.ceil(total / employeePageSize));
    employeeCurrentPage = Math.min(employeeCurrentPage, pages);
    const start = (employeeCurrentPage - 1) * employeePageSize;
    const visible = employeeFilteredRecords.slice(start, start + employeePageSize);
    body.innerHTML = visible.length ? visible.map((r, i) => `<tr>
        <td class="text-center">${start+i+1}</td><td>${escapeHtml(r.kodeBU)}</td><td>${escapeHtml(r.namaBU)}</td>
        <td class="font-mono">${escapeHtml(r.noJKN)}</td><td>${escapeHtml(r.namaPeserta)}</td>
        <td class="font-mono">${escapeHtml(r.noJKNKeluarga)}</td><td>${escapeHtml(r.namaKeluarga)}</td>
        <td>${escapeHtml(r.status)}</td><td class="text-right">${Number(r.bulanMenunggak).toLocaleString("id-ID")}</td>
        <td class="text-right">${formatEmployeeCurrency(r.nominalTagihan)}</td></tr>`).join("") :
        `<tr><td colspan="10" class="text-center py-8 text-slate-500">Tidak ada data yang cocok.</td></tr>`;
    const info = document.getElementById("employeePaginationInfo");
    if (info) info.textContent = total ? `Menampilkan ${start+1}–${Math.min(start+employeePageSize,total)} dari ${total} data` : "Tidak ada data";
    const count = document.getElementById("employeeCountLabel");
    if (count) count.textContent = `${total.toLocaleString("id-ID")} data karyawan ditemukan`;
    const controls = document.getElementById("employeePaginationControls");
    if (!controls) return;
    controls.innerHTML = pantauPagination(employeeCurrentPage, pages, page => `goEmployeePage(${page})`);
}
