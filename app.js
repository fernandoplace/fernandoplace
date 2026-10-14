const SHEET_ID = "1eOEnOQbtexTGvAChflSpap6R_zzDQwa1ccfp4bhNfwU";

let currentYearData = null;
let yearsList = [];
let cumulativeStartByYear = {};

const monthColours = ["#2948b8", "#0b6b52"];

/* TAB SWITCHING */
function showTab(tabId) {
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));

    const tabEl = document.getElementById(tabId);
    if (tabEl) tabEl.classList.add("active");

    const btn = document.querySelector(`.tab-button[data-tab="${tabId}"]`);
    if (btn) btn.classList.add("active");
}

/* Accounts tab loads latest year */
function openAccountsTab() {
    if (!yearsList.length) return;
    const latestYear = yearsList[yearsList.length - 1];
    const dropdown = document.getElementById("yearSelect");
    dropdown.value = latestYear;
    loadSheet(latestYear);
    showTab("accounts");
}

/* INITIAL LOAD */
document.addEventListener("DOMContentLoaded", async () => {
    await buildYearDropdown();
    document.getElementById("searchBox").addEventListener("input", filterContributions);
});

/* YEAR DROPDOWN */
async function buildYearDropdown() {
    const years = await getYears();
    yearsList = years;

    const dropdown = document.getElementById("yearSelect");
    dropdown.innerHTML = "";

    years.forEach(year => {
        const opt = document.createElement("option");
        opt.value = year;
        opt.textContent = year;
        dropdown.appendChild(opt);
    });

    await precomputeCumulativeStarts(years);

    dropdown.value = years[0];
    dropdown.addEventListener("change", () => loadSheet(dropdown.value));

    await loadSheet(years[0]);
}

/* FETCH YEARS */
async function getYears() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Years&tqx=out:json`;
    const res = await fetch(url);
    const txt = await res.text();
    const json = JSON.parse(txt.substring(47).slice(0, -2));
    return json.table.rows.map(r => r.c[0]?.v).filter(Boolean).map(String);
}

/* FETCH YEAR SHEET */
async function getRawSheetJson(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${sheetName}&tqx=out:json`;
    const res = await fetch(url);
    const txt = await res.text();
    return JSON.parse(txt.substring(47).slice(0, -2));
}

/* MONTH LABELS */
function getMonthLabels(json, year) {
    return json.table.cols.slice(2).map(col => `${col.label} ${year}`);
}

/* PARSE YEAR DATA */
function parseYearData(json, year) {
    const months = getMonthLabels(json, year);
    const rows = json.table.rows;

    const contributions = [];
    const deductions = [];
    const rawRows = [];

    let inDeductions = false;
    let stopDeductions = false;

    rows.forEach(row => {
        const cells = row.c || [];
        const house = cells[0]?.v ?? "";
        const name = cells[1]?.v ?? "";
        const label = String(name).trim();

        rawRows.push({
            label,
            values: cells.slice(2).map(c => (typeof c?.v === "number" ? c.v : 0))
        });

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

            contributions.push({ name: label, house: houseDisplay, values });
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
        rawRows
    };
}

/* PRECOMPUTE CUMULATIVE STARTS */
async function precomputeCumulativeStarts(years) {
    let runningCumulative = 0;

    for (let i = 0; i < years.length; i++) {
        const year = years[i];
        const json = await getRawSheetJson(year);
        const data = parseYearData(json, year);

        if (i === 0) {
            const potRow = data.rawRows.find(r =>
                String(r.label).trim().toLowerCase() === "current total in welfare pot"
            );
            const startFromSheet = potRow ? potRow.values[0] : 0;
            runningCumulative = startFromSheet;

            cumulativeStartByYear[year] = runningCumulative;

            for (let m = 1; m < data.netTotals.length; m++) {
                runningCumulative += data.netTotals[m];
            }
        } else {
            runningCumulative += data.netTotals[0];
            cumulativeStartByYear[year] = runningCumulative;

            for (let m = 1; m < data.netTotals.length; m++) {
                runningCumulative += data.netTotals[m];
            }
        }
    }
}

/* LOAD YEAR */
async function loadSheet(year) {
    document.getElementById("yearTitle").textContent = `Displaying Accounts for ${year}`;

    const json = await getRawSheetJson(year);
    currentYearData = parseYearData(json, year);

    computeCumulative(year);

    renderContributionsTable(currentYearData);
    renderDeductionsTable(currentYearData);
    renderTotalsTable(currentYearData);
}

/* CUMULATIVE */
function computeCumulative(year) {
    const start = cumulativeStartByYear[year] || 0;
    const cumulative = [];

    cumulative[0] = start;

    for (let i = 1; i < currentYearData.netTotals.length; i++) {
        cumulative[i] = cumulative[i - 1] + currentYearData.netTotals[i];
    }

    currentYearData.cumulative = cumulative;
}

/* RENDER CONTRIBUTIONS */
function renderContributionsTable(data) {
    const table = document.getElementById("contributionsTable");
    table.className = "contributions-table";
    table.innerHTML = "";

    const { months, contributions } = data;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    ["Name", "House Number", ...months].forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    contributions.forEach(row => {
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.textContent = row.name;
        tr.appendChild(tdName);

        const tdHouse = document.createElement("td");
        tdHouse.textContent = row.house;
        tr.appendChild(tdHouse);

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

/* RENDER DEDUCTIONS */
function renderDeductionsTable(data) {
    const table = document.getElementById("deductionsTable");
    table.className = "deductions-table";
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
            td.textContent = Math.abs(v) || "";
            td.style.backgroundColor = monthColours[idx % 2];
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

/* RENDER TOTALS */
function renderTotalsTable(data) {
    const table = document.getElementById("totalsTable");
    table.className = "totals-table";
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
    addTotalsRow(tbody, "Total Deductions", deductTotals.map(v => Math.abs(v)), "total-deduct");
    addTotalsRow(tbody, "Net (Contrib - Deduct)", netTotals, "total-net");
    addTotalsRow(tbody, "Cumulative", cumulative, "total-cum");

    table.appendChild(tbody);
}

/* ADD TOTAL ROW */
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

/* SEARCH */
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
    renderTotalsTable(currentYearData);
}


async function loadGateContributions() {
    const sheetId = "1nQzkgNk31p56mM67QdUB0Rn-bGEqwbdvlKhPawRWQtQ";
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json`;

    try {
        const response = await fetch(sheetUrl);
        const text = await response.text();

        const json = JSON.parse(text.substring(47, text.length - 2));
        const rows = json.table.rows;

        let total = 0;
        let html = `
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Contribution (LKR)</th>
                </tr>
            </thead>
            <tbody>
        `;

        rows.forEach(row => {
            const name = row.c[0]?.v || "";
            const amount = row.c[1]?.v || 0;

            total += Number(amount);

            html += `
                <tr>
                    <td>${name}</td>
                    <td>${amount.toLocaleString()}</td>
                </tr>
            `;
        });

        html += `</tbody>`;

        document.getElementById("gateContribTable").innerHTML = html;
        document.getElementById("gateTotalAmount").innerText = "LKR " + total.toLocaleString();

    } catch (err) {
        console.error("Error loading gate contributions:", err);
        document.getElementById("gateTotalAmount").innerText = "Error loading total";
    }
}

function openGateTab() {
    showTab("gate");
    loadGateContributions();
}


