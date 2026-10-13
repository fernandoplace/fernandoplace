const SHEET_ID =
"1TulMhIonOak7EQ9RIis_RSNmYDOERMP6W96EMrwi_EE";

let currentData = [];

const monthColours = [
    "#2948b8",
    "#0b6b52"
];

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        await buildYearDropdown();

        document
            .getElementById("searchBox")
            .addEventListener(
                "input",
                filterTable
            );
    }
);

function showTab(tabId) {

    document
        .querySelectorAll(".tab-content")
        .forEach(tab =>
            tab.classList.remove("active")
        );

    document
        .querySelectorAll(".tab-button")
        .forEach(btn =>
            btn.classList.remove("active")
        );

    document
        .getElementById(tabId)
        .classList.add("active");

    document
        .querySelector(
            `[onclick="showTab('${tabId}')"]`
        )
        .classList.add("active");
}


async function buildYearDropdown() {

    const years =
        await getYears();

    const dropdown =
        document.getElementById(
            "yearSelect"
        );

    dropdown.innerHTML = "";

    years.forEach(year => {

        const option =
            document.createElement(
                "option"
            );

        option.value = year;
        option.textContent = year;

        dropdown.appendChild(option);

    });

    const latestYear =
        years[years.length - 1];

    dropdown.value =
        latestYear;

    dropdown.addEventListener(
        "change",
        () => loadSheet(
            dropdown.value
        )
    );

    loadSheet(latestYear);
}

async function getYears() {

    const url =
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=Years&tqx=out:json`;

    const response =
        await fetch(url);

    const text =
        await response.text();

    const json =
        JSON.parse(
            text.substring(47)
                .slice(0,-2)
        );

    return json.table.rows
        .map(
            row =>
            row.c[0]?.v
        )
        .filter(Boolean)
        .map(String);
}

async function getSheetData(sheetName) {

    const url =
        `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?sheet=${sheetName}&tqx=out:json`;

    const response =
        await fetch(url);

    const text =
        await response.text();

    const json =
        JSON.parse(
            text.substring(47)
                .slice(0,-2)
        );

    const data = [];

    const headers =
        ["JobName"];

    json.table.cols
        .slice(1)
        .forEach(col =>
            headers.push(
                col.label || ""
            )
        );

    data.push(headers);


    json.table.rows.forEach(row => {

    const values =
        row.c.map(cell =>
            cell && cell.v !== null
                ? cell.v
                : ""
        );

    const jobName =
        String(values[0] || "")
            .trim()
            .toLowerCase();

    if (
        jobName.startsWith("total") ||
        jobName.startsWith("cumulative")
    ) {
        return;
    }

    data.push(values);

    });


    return data;
}

async function loadSheet(year) {

    document
        .getElementById(
            "yearTitle"
        )
        .textContent =
        `Displaying Data for ${year}`;

    currentData =
        await getSheetData(year);

    let displayData =
        structuredClone(
            currentData
        );

    displayData =
        addTotals(
            displayData
        );

    displayData =
        addCumulative(
            displayData
        );

    renderTable(
        displayData
    );
}

function addTotals(data) {

    const totals =
        ["TOTAL"];

    for (
        let c = 1;
        c < data[0].length;
        c++
    ) {

        let sum = 0;

        for (
            let r = 1;
            r < data.length;
            r++
        ) {

            sum +=
                Number(
                    data[r][c]
                ) || 0;
        }

        totals.push(sum);
    }

    data.push(totals);

    return data;
}

function addCumulative(data) {

    const totalRow =
        data[data.length - 1];

    const cumulative =
        ["CUMULATIVE"];

    let running = 0;

    for (
        let c = 1;
        c < totalRow.length;
        c++
    ) {

        running +=
            Number(
                totalRow[c]
            ) || 0;

        cumulative.push(
            running
        );
    }

    data.push(cumulative);

    return data;
}

function renderTable(data) {

    const table =
        document.getElementById(
            "jobTable"
        );

    table.innerHTML = "";

    data.forEach(
        (row,rowIndex) => {

            const tr =
                document.createElement(
                    "tr"
                );

            if (
                row[0] === "TOTAL"
            ) {
                tr.classList.add(
                    "total-row"
                );
            }

            if (
                row[0] ===
                "CUMULATIVE"
            ) {
                tr.classList.add(
                    "cumulative-row"
                );
            }

            row.forEach(
                (cell,colIndex) => {

                    const el =
                        document.createElement(
                            rowIndex === 0
                                ? "th"
                                : "td"
                        );

                    el.textContent =
                        cell;

                    if (
                        rowIndex > 0 &&
                        colIndex > 0 &&
                        row[0] !== "TOTAL" &&
                        row[0] !== "CUMULATIVE"
                    ) {

                        el.style.backgroundColor =
                            monthColours[
                                (colIndex - 1) % 2
                            ];
                    }

                    tr.appendChild(el);
                }
            );

            table.appendChild(tr);
        }
    );
}

function filterTable() {

    const search =
        document
            .getElementById(
                "searchBox"
            )
            .value
            .toLowerCase();

    let filtered =
        currentData.filter(
            (row,index) =>
                index === 0 ||
                String(row[0])
                    .toLowerCase()
                    .includes(search)
        );

    filtered =
        addTotals(
            structuredClone(
                filtered
            )
        );

    filtered =
        addCumulative(
            filtered
        );

    renderTable(
        filtered
    );
}
