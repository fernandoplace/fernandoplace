
const SHEET_ID = "1eOEnOQbtexTGvAChflSpap6R_zzDQwa1ccfp4bhNfwU";

let currentYear = null;
let currentYearData = null;
let globalTotals = null;

const monthColours = ["#2948b8", "#0b6b52"];

document.addEventListener("DOMContentLoaded", async () => {
    await buildYearDropdown();
    document.getElementById("searchBox").addEventListener("input", filterContributions);
});

function showTab(tabId) {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
    document.getElementById(tabId).classList.add("active");
    document.querySelector(`[onclick="showTab('${tabId}')"]`).classList.add("active");
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

    const latest = years[years.length - 1];
    dropdown.value = latest;

    dropdown.addEventListener("change", () => loadSheet(dropdown.value));
    await loadSheet(latest);
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
    let cumulativeStartSep2023 = null;

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

        if (label === "Current Total in Welfare Pot") {
            if (year === "2023") {
                cumulativeStartSep2023 = cells[2]?.v ?? 0;
            }
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
        netTotals,
        cumulativeStartSep2023
    };
}

async function loadSheet(year) {
    currentYear = year;

    document.getElementById("yearTitle").textContent = `Displaying Data for ${year}`;

    const json = await getRawSheetJson(year);
    currentYearData = parseYearData(json, year);

    await buildGlobalTotals();

    renderContributionsTable(currentYearData);
    renderDeductionsTable(currentYearData);
    renderTotalsTable(globalTotals);
}

async function buildGlobalTotals() {
    const years = await getYears();

    const allMonths = [];
    const allContribTotals = [];
    const allDeductTotals = [];
    const allNetTotals = [];

    let cumulativeStart = null;

    for (const y of years) {
        const json = await getRawSheetJson(y);
        const yd = parseYearData(json, y);

        if (y === "2023" && yd.cumulativeStartSep2023 != null) {
            cumulativeStart = yd.cumulativeStartSep2023;
        }

        yd.months.forEach((m, idx) => {
            allMonths.push(m);
            allContribTotals.push(yd.contribTotals[idx]);
            allDeductTotals.push(yd.deductTotals[idx]);
            allNetTotals.push(yd.netTotals[idx]);
        });
    }

    const cumulative = [];
    cumulative[0] = cumulativeStart ?? 0;

    for (let i = 1; i < allMonths.length; i++) {
        cumulative[i] = cumulative[i - 1] + allNetTotals[i];
    }

    globalTotals = {
        months: allMonths,
        contribTotals: allContribTotals,
        deductTotals: allDeductTotals,
        netTotals: allNetTotals,
        cumulative
    };
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

function renderTotalsTable(totals) {
    const table = document.getElementById("totalsTable");
    table.innerHTML = "";

    const { months, contribTotals, deductTotals, netTotals, cumulative } = totals;

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
        const td = document.createElement("td");
        td.textContent = v || "";
        tr.appendChild(td);
    });

    tbody.appendChild(tr);
}

function filterContributions() {
    const search = document.getElementById("searchBox").value.toLowerCase();

    const filtered = currentYearData.contributions.filter(r =>
        r.house.toLowerCase().includes(search) ||
        r.name.toLowerCase().includes(search)
    );

    const filteredData = {
        ...currentYearData,
        contributions: filtered
    };

    renderContributionsTable(filteredData);
    renderDeductionsTable(currentYearData);
    renderTotalsTable(globalTotals);
}

