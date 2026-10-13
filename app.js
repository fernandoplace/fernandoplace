const SHEET_ID = "1eOEnOQbtexTGvAChflSpap6R_zzDQwa1ccfp4bhNfwU";

let currentRaw = [];
let sep2023Cumulative = 0;

document.addEventListener("DOMContentLoaded", async () => {
    await buildYearDropdown();
    document.getElementById("searchBox").addEventListener("input", filterTables);
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
    loadSheet(latest);
}

async function getYears() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Years&tqx=out:json`;
    const res = await fetch(url);
    const txt = await res.text();
    const json = JSON.parse(txt.substring(47).slice(0, -2));
    return json.table.rows.map(r => r.c[0]?.v).filter(Boolean).map(String);
}

async function getSheetData(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${sheetName}&tqx=out:json`;
    const res = await fetch(url);
    const txt = await res.text();
    const json = JSON.parse(txt.substring(47).slice(0, -2));

    const headers = ["House_no", "Income_source_deduction"];
    json.table.cols.slice(2).forEach(col => headers.push(col.label || ""));

    const data = [headers];

    json.table.rows.forEach(row => {
        const vals = row.c.map(c => (c && c.v !== null ? c.v : ""));
        data.push(vals);
    });

    return data;
}

async function loadSheet(year) {
    document.getElementById("yearTitle").textContent = `Displaying Data for ${year}`;

    currentRaw = await getSheetData(year);

    if (year === "2023") {
        sep2023Cumulative = extractSep2023Cumulative(currentRaw);
    }

    const { contributions, deductions } = splitData(currentRaw);
    const totals = computeTotals(contributions, deductions, year);

    renderTable(contributions, "contribTable");
    renderTable(deductions, "deductTable");
    renderTable(totals, "totalTable");
}

function extractSep2023Cumulative(data) {
    const idx = data.findIndex(r => String(r[1]).toLowerCase().includes("current total in welfare pot"));
    return Number(data[idx][2]) || 0;
}

function splitData(data) {
    const deductStart = data.findIndex(r => String(r[1]).toLowerCase().includes("deductions"));
    const deductEnd = data.findIndex(r => String(r[1]).toLowerCase().includes("total collection for month"));

    const contributions = data.slice(1, deductStart);
    const deductions = data.slice(deductStart + 1, deductEnd);

    return { contributions, deductions };
}

function computeTotals(contrib, deduct, year) {
    const headers = contrib[0].slice(2);

    const totalContrib = ["Total Contributions", ""];
    const totalDeduct = ["Total Deductions", ""];
    const net = ["Net (Contrib - Deduct)", ""];
    const cumulative = ["Cumulative", ""];

    let running = year === "2023" ? sep2023Cumulative : cumulativeCarryForward();

    for (let c = 2; c < contrib[0].length; c++) {
        let sumC = 0, sumD = 0;

        contrib.forEach((row, idx) => {
            if (idx > 0) sumC += Number(row[c]) || 0;
        });

        deduct.forEach(row => {
            sumD += Number(row[c]) || 0;
        });

        totalContrib.push(sumC);
        totalDeduct.push(sumD);

        const netVal = sumC - sumD;
        net.push(netVal);

        running += netVal;
        cumulative.push(running);
    }

    return [
        ["Metric", "Label", ...headers],
        totalContrib,
        totalDeduct,
        net,
        cumulative
    ];
}

function cumulativeCarryForward() {
    return sep2023Cumulative;
}

function renderTable(data, tableId) {
    const table = document.getElementById(tableId);
    table.innerHTML = "";

    data.forEach((row, rowIndex) => {
        const tr = document.createElement("tr");

        row.forEach((cell, colIndex) => {
            const el = document.createElement(rowIndex === 0 ? "th" : "td");
            el.textContent = cell;
            tr.appendChild(el);
        });

        table.appendChild(tr);
    });
}

function filterTables() {
    const search = document.getElementById("searchBox").value.toLowerCase();

    const { contributions, deductions } = splitData(currentRaw);

    const filteredContrib = contributions.filter((r, i) =>
        i === 0 ||
        String(r[1]).toLowerCase().includes(search) ||
        String(r[0]).toLowerCase().includes(search)
    );

    const totals = computeTotals(filteredContrib, deductions, document.getElementById("yearSelect").value);

    renderTable(filteredContrib, "contribTable");
    renderTable(deductions, "deductTable");
    renderTable(totals, "totalTable");
}

