const SHEET_ID = "1eOEnOQbtexTGvAChflSpap6R_zzDQwa1ccfp4bhNfwU";

let currentYear = null;
let currentYearData = null; // { months, contributions, deductions, totals }
let globalTotals = null;    // { months, contribTotals, deductTotals, netTotals, cumulative }

const monthColours = ["#2948b8", "#0b6b52"];

document.addEventListener("DOMContentLoaded", async () => {
    await buildYearDropdown();

    const searchBox = document.getElementById("searchBox");
    if (searchBox) {
        searchBox.addEventListener("input", filterContributions);
    }
});

function showTab(tabId) {
    document
        .querySelectorAll(".tab-content")
        .forEach(tab => tab.classList.remove("active"));

    document
        .querySelectorAll(".tab-button")
        .forEach(btn => btn.classList.remove("active"));

    document
        .getElementById(tabId)
        .classList.add("active");

    document
        .querySelector(`[onclick="showTab('${tabId}')"]`)
        .classList.add("active");
}

async function buildYearDropdown() {
    const years = await getYears();
    const dropdown = document.getElementById("yearSelect");
    dropdown.innerHTML = "";

    years.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        dropdown.appendChild(option);
    });

    const latestYear = years[years.length - 1];
    dropdown.value = latestYear;

    dropdown.addEventListener("change", () => loadSheet(dropdown.value));

    await loadSheet(latestYear);
}

async function getYears() {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Years&tqx=out:json`;
    const response = await fetch(url);
    const text = await response.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));

    return json.table.rows
        .map(row => row.c[0]?.v)
        .filter(Boolean)
        .map(String);
}

async function getRawSheetJson(sheetName) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${sheetName}&tqx=out:json`;
    const response = await fetch(url);
    const text = await response.text();
    const json = JSON.parse(text.substring(47).slice(0, -2));
    return json;
}

function getMonthLabels(json, year) {
    // cols: 0 = House_no, 1 = Income_source_deduction, 2+ = months
    const cols = json.table.cols.slice(2);
    return cols.map(col => {
        const base = (col.label || "").trim();
        if (!base) return "";
        return `${base} ${year}`;
    });
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
            // For 2023, Sep (first month col) is starting cumulative
            if (year === "2023" && months.length > 0) {
                const sepCell = cells[2]?.v;
                if (typeof sepCell === "number") {
                    cumulativeStartSep2023 = sepCell;
                }
            }
            return;
        }

        // Collect monthly values
        const values = cells.slice(2).map(c => {
            const v = c?.v;
            return typeof v === "number" ? v : 0;
        });

        if (!inDeductions && !stopDeductions) {
            // Contributions
            let houseDisplay = String(house).trim();
            if (!houseDisplay || houseDisplay === "-") {
                houseDisplay = "Other";
            }
            contributions.push({
                house: houseDisplay,
                name: String(name).trim(),
                values
            });
        } else if (inDeductions && !stopDeductions) {
            // Deductions
            deductions.push({
                description: String(name).trim(),
                values
            });
        }
    });

    // Compute monthly totals for this year
    const contribTotals = new Array(months.length).fill(0);
    const deductTotals = new Array(months.length).fill(0);

    contributions.forEach(row => {
        row.values.forEach((v, i) => {
            contribTotals[i] += v;
        });
    });

    deductions.forEach(row => {
        row.values.forEach((v, i) => {
            deductTotals[i] += v;
        });
    });

    const netTotals = contribTotals.map((v, i) => v + deductTotals[i]); // deductions are negative

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

    document.getElementById("yearTitle").textContent =
        `Displaying Data for ${year}`;

    const json = await getRawSheetJson(year);
    const yearData = parseYearData(json, year);
    currentYearData = yearData;

    // Build global totals across all years (for Grand Totals)
    await buildGlobalTotals();

    renderContributionsTable(yearData);
    renderDeductionsTable(yearData);
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

        // For 2023, capture starting cumulative from Sep 2023
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

    // Build cumulative across all months
    const cumulative = new Array(allMonths.length).fill(0);
    if (cumulativeStart == null) {
        cumulativeStart = 0;
    }

    for (let i = 0; i < allMonths.length; i++) {
        if (i === 0) {
            // First month (Sep 2023) uses starting cumulative
            cumulative[i] = cumulativeStart;
        } else {
            cumulative[i] = cumulative[i - 1] + allNetTotals[i];
        }
    }

    globalTotals = {
        months: allMonths,
        contribTotals: allContribTotals,
        deductTotals: allDeductTotals,
        netTotals: allNetTotals,
        cumulative
    };
}

function renderContributionsTable(yearData) {
    const table = document.getElementById("contributionsTable");
    if (!table) return;
    table.innerHTML = "";

    const { months, contributions } = yearData;

    // Header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const hHouse = document.createElement("th");
    hHouse.textContent = "House Number";
    headerRow.appendChild(hHouse);

    const hName = document.createElement("th");
    hName.textContent = "Name";
    headerRow.appendChild(hName);

    months.forEach((m, idx) => {
        const th = document.createElement("th");
        th.textContent = m;
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
            td.textContent = v ? v : "";
            // Month color alternation
            td.style.backgroundColor = monthColours[idx % monthColours.length];
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

function renderDeductionsTable(yearData) {
    const table = document.getElementById("deductionsTable");
    if (!table) return;
    table.innerHTML = "";

    const { months, deductions } = yearData;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const hDesc = document.createElement("th");
    hDesc.textContent = "Description of Expense";
    headerRow.appendChild(hDesc);

    months.forEach((m, idx) => {
        const th = document.createElement("th");
        th.textContent = m;
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
            td.textContent = v ? v : "";
            td.style.backgroundColor = monthColours[idx % monthColours.length];
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
}

function renderTotalsTable(totals) {
    const table = document.getElementById("totalsTable");
    if (!table) return;
    table.innerHTML = "";

    const { months, contribTotals, deductTotals, netTotals, cumulative } = totals;

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    const hMetric = document.createElement("th");
    hMetric.textContent = "Metric";
    headerRow.appendChild(hMetric);

    const hLabel = document.createElement("th");
    hLabel.textContent = "Label";
    headerRow.appendChild(hLabel);

    months.forEach(m => {
        const th = document.createElement("th");
        th.textContent = m;
        headerRow.appendChild(th);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");

    // Total Contributions
    const trContrib = document.createElement("tr");
    trContrib.classList.add("total-contrib");
    addTotalsRow(trContrib, "Total Contributions", "", contribTotals);
    tbody.appendChild(trContrib);

    // Total Deductions
    const trDeduct = document.createElement("tr");
    trDeduct.classList.add("total-deduct");
    addTotalsRow(trDeduct, "Total Deductions", "", deductTotals);
    tbody.appendChild(trDeduct);

    // Net
    const trNet = document.createElement("tr");
    trNet.classList.add("total-net");
    addTotalsRow(trNet, "Net (Contrib - Deduct)", "", netTotals);
    tbody.appendChild(trNet);

    // Cumulative
    const trCum = document.createElement("tr");
    trCum.classList.add("total-cum");
    addTotalsRow(trCum, "Cumulative", "", cumulative);
    tbody.appendChild(trCum);

    table.appendChild(tbody);
}

function addTotalsRow(tr, metricName, label, values) {
    const tdMetric = document.createElement("td");
    tdMetric.textContent = metricName;
    tr.appendChild(tdMetric);

    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;
    tr.appendChild(tdLabel);

    values.forEach(v => {
        const td = document.createElement("td");
        td.textContent = v ? v : "";
        tr.appendChild(td);
    });
}

function filterContributions() {
    if (!currentYearData) return;

    const search = document
        .getElementById("searchBox")
        .value
        .toLowerCase();

    const { months, contributions, deductions } = currentYearData;

    const filteredContrib = contributions.filter(row => {
        const h = String(row.house).toLowerCase();
        const n = String(row.name).toLowerCase();
        return !search || h.includes(search) || n.includes(search);
    });

    // Recompute totals for this year based on filtered contributions
    const contribTotals = new Array(months.length).fill(0);
    const deductTotals = new Array(months.length).fill(0);

    filteredContrib.forEach(row => {
        row.values.forEach((v, i) => {
            contribTotals[i] += v;
        });
    });

    deductions.forEach(row => {
        row.values.forEach((v, i) => {
            deductTotals[i] += v;
        });
    });

    const netTotals = contribTotals.map((v, i) => v + deductTotals[i]);

    const filteredYearData = {
        ...currentYearData,
        contributions: filteredContrib,
        contribTotals,
        deductTotals,
        netTotals
    };

    renderContributionsTable(filteredYearData);
    renderDeductionsTable(filteredYearData);

    // Grand totals remain global (not filtered) – as per your welfare pot logic
    renderTotalsTable(globalTotals);
}

