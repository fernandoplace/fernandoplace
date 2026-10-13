const SHEET_ID = "1eOEnOQbtexTGvAChflSpap6R_zzDQwa1ccfp4bhNfwU";

let currentYearData = null;
let previousYearCumulative = 0;

const monthColours = ["#2948b8", "#0b6b52"];

document.addEventListener("DOMContentLoaded", async () => {
    await buildYearDropdown();
    document.getElementById("searchBox").addEventListener("input", filterContributions);
});

function showTab(tabId) {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");
    document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add("active");
}

async function buildYearDropdown() {
    const years = await getYears();
    const dropdown = document.getElementById("yearSelect");
    dropdown.innerHTML = "";

    years.forEach(year => {
        const opt = document.createElement("option");
        opt.value = year;
        opt.textContent = year;
        dropdown.appendChild(opt);
    });

    dropdown.value = years[0];
    dropdown.addEventListener("change", () => loadSheet(dropdown.value));

    await loadSheet(years[0]);
}

async function getYears() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Years&tqx=out:json`;
    const res = await fetch(url);
    const txt = await res.text();
    const json = JSON.parse(txt.substring(47).slice(0, -2));
    return json.table.rows.map(r => r.c[0]?.v).filter(Boolean).map(String);
}

async function getRawSheetJson(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${sheetName}&tqx=out:json`;
    const res = await fetch(url);
    const txt = await res.text();
    return JSON.parse(txt.substring(47).slice(0, -2));
}

function getMonthLabels(json, year) {
    return json.table.cols.slice(2).map(col => `${col.label} ${year}`);
}

function parseYearData(json, year) {
    const months = getMonthLabels(json, year);
    const rows = json.table.rows;

    const contributions = [];
    const deductions = [];

    let inDeductions = false;
    let stopDeductions = false;

    rows.forEach(row => {
        const cells = row.c || [];
        const house = cells[0]?.v ?? "";
        const name = cells[1]?.v ?? "";
        const label = String(name).trim();

        if (label === "Deductions") {
            inDeductions = true;
            return;
        }

        if (label === "Total Collection for Month") {
            stopDeductions = true;
            return;
        }

        const values = cells.slice(2).map(c => (typeof c?.v === "number" ? c.v : 0));

        if (!inDeductions && !stopDeductions) {
            let houseDisplay = String(house).trim();
            if (!houseDisplay || houseDisplay === "-") houseDisplay = "Other";

            contributions.push({ house: houseDisplay, name: label, values });
        } else if (inDeductions && !stopDeductions) {
            deductions.push({ description: label, values });
        }
    });

    const contribTotals = months.map((_, i) =>
        contributions.reduce((sum, r) => sum + r.values[i], 0)
    );

    const deductTotals = months.map((_, i) =>
        deductions.reduce((sum, r) => sum + r.values[i], 0)
    );

    const netTotals = contribTotals.map((v, i) => v + deductTotals[i]);

    return {
        year,
        months,
        contributions,
        deductions,
        contribTotals,
        deductTotals,
        netTotals
    };
}

async function loadSheet(year) {
    document.getElementById("yearTitle").textContent = `Displaying Data for ${year}`;

    const json = await getRawSheetJson(year);
    currentYearData = parseYearData(json, year);

    computeCumulative(year);

    renderContributionsTable(currentYearData);
    renderDeductionsTable(currentYearData);
    renderTotalsTable(currentYearData);
}

function computeCumulative(year) {
    const years = ["2023", "2024", "2025", "2026"];
    const yearIndex = years.indexOf(year);

    if (yearIndex === 0) {
        previousYearCumulative = currentYearData.netTotals[0];
    }

    const cumulative = [];
    cumulative[0] = previousYearCumulative;

    for (let i = 1; i < currentYearData.netTotals.length; i++) {
        cumulative[i] = cumulative[i - 1] + currentYearData.netTotals[i];
    }

    previousYearCumulative = cumulative[cumulative.length - 1];
    currentYearData.cumulative = cumulative;
}

function renderContributionsTable(data) {
    const table = document.getElementById("contributionsTable");
    table.innerHTML = "";

    const { months, contributions } = data;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    ["House Number", "Name", ...months].forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    contributions.forEach(row => {
        const tr = document.createElement("tr");

        const tdHouse = document.createElement("td");
        tdHouse.textContent = row.house;
        tr.appendChild(tdHouse);

        const tdName = document.createElement("td");
        tdName.textContent = row.name;
        tr.appendChild(tdName);

        row.values.forEach((v, idx) => {
            const td = document.createElement("td");
            td.textContent = v || "";
            td.style.backgroundColor = monthColours[idx % 2];
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

function renderDeductionsTable(data) {
    const table = document.getElementById("deductionsTable");
    table.innerHTML = "";

    const { months, deductions } = data;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    ["Description of Expense", ...months].forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    deductions.forEach(row => {
        const tr = document.createElement("tr");

        const tdDesc = document.createElement("td");
        tdDesc.textContent = row.description;
        tr.appendChild(tdDesc);

        row.values.forEach((v, idx) => {
            const td = document.createElement("td");
            td.textContent = v || "";
            td.style.backgroundColor = monthColours[idx % 2];
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

function renderTotalsTable(data) {
    const table = document.getElementById("totalsTable");
    table.innerHTML = "";

    const { months, contribTotals, deductTotals, netTotals, cumulative } = data;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    ["Metric", ...months].forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    addTotalsRow(tbody, "Total Contributions", contribTotals, "total-contrib");
    addTotalsRow(tbody, "Total Deductions", deductTotals, "total-deduct");
    addTotalsRow(tbody, "Net (Contrib - Deduct)", netTotals, "total-net");
    addTotalsRow(tbody, "Cumulative", cumulative, "total-cum");

    table.appendChild(tbody);
}

function addTotalsRow(tbody, metric, values, className) {
    const tr = document.createElement("tr");
    tr.classList.add(className);

    const tdMetric = document.createElement("td");
    tdMetric.textContent = metric;
    tr.appendChild(tdMetric);

    values.forEach(v => {

