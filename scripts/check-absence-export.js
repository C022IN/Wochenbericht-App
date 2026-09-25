// End-to-end check: runs BOTH real exporters (ExcelJS + Python) against the template the app
// loads at runtime, with full-day Urlaub/Krank rows, and verifies the weekly total picks up the
// 8 hours (and that both backends agree). Run from the repo root:
//
//   node scripts/check-absence-export.js
//
// The ExcelJS exporter is TypeScript, so it is compiled into a gitignored build dir at runtime.
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { Workbook } = require("exceljs");

const BUILD_DIR = ".export-check-build";
execFileSync(
  process.execPath,
  [
    "./node_modules/typescript/bin/tsc",
    "lib/export-xlsx-js.ts",
    "lib/entry-utils.ts",
    "lib/types.ts",
    "--outDir",
    BUILD_DIR,
    "--module",
    "commonjs",
    "--target",
    "es2020",
    "--moduleResolution",
    "node",
    "--skipLibCheck",
    "--esModuleInterop"
  ],
  { stdio: "inherit" }
);
const { exportXlsxJs } = require(path.resolve(BUILD_DIR, "export-xlsx-js.js"));

const TEMPLATE_PATH = path.join("examples", "empty", "AXIANS OFM Wochenbericht Februar 2026 KW 9.xlsx");
const WEEK = ["2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01"];
const failures = [];

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label} -> expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) failures.push(label);
}

function makeRow(o) {
  return {
    date: o.date,
    kind: o.kind || "fahrzeit",
    siteNameOrt: o.site || "",
    beginn: o.beginn || "",
    ende: o.ende || "",
    pauseOverride: o.pause || "",
    dayHoursOverride: o.dayHours === undefined ? "" : o.dayHours,
    fahrzeit: o.fahrzeit || "",
    lohnType: o.lohn || "S",
    ausloese: "",
    zulage: "",
    projektnummer: o.proj || "",
    kabelschachtInfo: "",
    smNr: "",
    bauleiter: "",
    arbeitskollege: ""
  };
}

const rows = [
  // Row 10 (Mon): normal bracketed work day. 07:00-16:00 = 9h gross, auto pause 0.5 -> O=9, P=8.5.
  makeRow({ date: WEEK[0], kind: "site", site: "Baustelle Nord", beginn: "07:00", ende: "16:00", dayHours: "__AUTO_FROM_TIME__", lohn: "S", proj: "P.0923220.1.01" }),
  // Row 11 (Tue): Urlaub, full day, 8h, no clock bracket. Row 11 is the shared-formula MASTER of
  // the data block, so this is the hardest case for the exporter.
  makeRow({ date: WEEK[1], kind: "fahrzeit", site: "Urlaub", dayHours: "8", lohn: "U", proj: "G.014182.840.00" }),
  // Row 12 (Wed): normal site row with only day-hours (no bracket) -> must NOT count.
  makeRow({ date: WEEK[2], kind: "site", site: "Baustelle Sued", dayHours: "8", lohn: "S", proj: "P.0923220.1.01" }),
  // Row 13 (Thu): Krank, full day, 8h -> second absence, to check a non-master absence row too.
  makeRow({ date: WEEK[3], kind: "fahrzeit", site: "Krank", dayHours: "8", lohn: "K", proj: "G.014182.838.00" })
];

const payload = {
  kw: 9,
  reportEnd: "2026-03-01",
  reportStartDe: "23.02.2026",
  reportEndDe: "28.02.2026",
  allWeekDates: WEEK,
  segmentDates: WEEK,
  profile: { name: "Mustermann", vorname: "Max", arbeitsstaetteProjekte: "Testprojekt", artDerArbeit: "S05" },
  rows,
  carData: { kennzeichen: "LIF-B 1", kennzeichen2: "", kmStand: "0", kmGefahren: "0" }
};

function autoPause(gross) {
  if (gross > 9.5) return 0.75;
  if (gross > 6) return 0.5;
  return 0;
}

function bracketGross(ws, r) {
  // ExcelJS reads time-formatted E/F cells back as Date objects (epoch 1899-12-30), so accept
  // either a raw day-fraction number or a Date and normalise to a 0–1 day fraction.
  const toFrac = (v) => {
    if (typeof v === "number") return v;
    if (v instanceof Date) return (v.getUTCHours() * 60 + v.getUTCMinutes()) / (24 * 60);
    return null;
  };
  const e = toFrac(ws.getCell(`E${r}`).value);
  const f = toFrac(ws.getCell(`F${r}`).value);
  if (e === null || f === null) return null;
  let diff = f - e;
  if (diff < 0) diff += 1;
  return diff * 24;
}

function oValue(ws, r) {
  const v = ws.getCell(`O${r}`).value;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "formula" in v) return bracketGross(ws, r) ?? 0;
  return 0;
}

function pValue(ws, r) {
  const v = ws.getCell(`P${r}`).value;
  if (typeof v === "number") return v;
  if (v && typeof v === "object" && "formula" in v) {
    const gross = bracketGross(ws, r);
    if (gross === null) return 0;
    const g = ws.getCell(`G${r}`).value;
    const pause = typeof g === "number" ? g : autoPause(gross);
    return Math.round((gross - pause) * 100) / 100;
  }
  return 0;
}

function describe(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return "empty";
  if (typeof v === "number") return `number(${v})`;
  if (typeof v === "string") return `text(${v})`;
  if (typeof v === "object" && typeof v.formula === "string") return "formula";
  if (typeof v === "object" && v.sharedFormula) return "sharedFormula";
  return typeof v;
}

// Find the weekly total row by looking for the SUM over the data block.
function findTotalRow(ws) {
  let found = null;
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const v = cell.value;
      if (v && typeof v === "object" && typeof v.formula === "string" && /SUM\(O10:O\d+\)/.test(v.formula)) {
        found = cell.row;
      }
    });
  });
  return found;
}

async function inspect(label, file) {
  const wb = new Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet("Wochenbericht");
  const totalRow = findTotalRow(ws);
  console.log(`\n=== ${label} (${file}) ===`);
  console.log(`  weekly total row detected: ${totalRow}`);

  console.log(`  row10 Mon work  : A=${JSON.stringify(ws.getCell("A10").value)} O=${describe(ws.getCell("O10"))} H10=${JSON.stringify(ws.getCell("H10").value)}`);
  console.log(`  row11 Tue Urlaub: A=${JSON.stringify(ws.getCell("A11").value)} O=${describe(ws.getCell("O11"))} P=${describe(ws.getCell("P11"))} G=${describe(ws.getCell("G11"))} I11=${JSON.stringify(ws.getCell("I11").value)} T11=${JSON.stringify(ws.getCell("T11").value)}`);
  console.log(`  row12 Wed site  : A=${JSON.stringify(ws.getCell("A12").value)} O=${describe(ws.getCell("O12"))} J12=${JSON.stringify(ws.getCell("J12").value)}`);
  console.log(`  row13 Thu Krank : A=${JSON.stringify(ws.getCell("A13").value)} O=${describe(ws.getCell("O13"))} P=${describe(ws.getCell("P13"))} K13=${JSON.stringify(ws.getCell("K13").value)}`);
  console.log(`  row14 empty     : O=${describe(ws.getCell("O14"))}`);

  check(`${label} row11 O is literal 8`, ws.getCell("O11").value, 8);
  check(`${label} row11 P is literal 8`, ws.getCell("P11").value, 8);
  check(`${label} row11 weekday I = 8`, ws.getCell("I11").value, 8);
  check(`${label} row11 has no numeric pause`, typeof ws.getCell("G11").value, "object");
  check(`${label} row13 O is literal 8`, ws.getCell("O13").value, 8);
  check(`${label} row13 weekday K = 8 (Krank on Thursday -> column K)`, ws.getCell("K13").value, 8);
  // Same column, plain rows: formula for the bracketed day, formula for the non-absence day-hours day.
  check(`${label} row10 O stays a formula`, describe(ws.getCell("O10")), "formula");
  check(`${label} row12 O stays a formula`, describe(ws.getCell("O12")), "formula");
  // Untouched clone row must not inherit the absence hours.
  check(`${label} row14 O contributes 0`, oValue(ws, 14), 0);

  let sumO = 0;
  let sumP = 0;
  for (let r = 10; r <= 49; r++) {
    sumO += oValue(ws, r);
    sumP += pValue(ws, r);
  }
  check(`${label} weekly O total = 9 (Mon) + 8 (Urlaub) + 8 (Krank)`, Math.round(sumO * 100) / 100, 25);
  check(`${label} weekly P total = 8.5 (Mon) + 8 + 8`, Math.round(sumP * 100) / 100, 24.5);

  check(`${label} total row detected`, typeof totalRow, "number");
  const oFormula = ws.getCell(`O${totalRow}`).value;
  check(`${label} total row sums the data block`, /SUM\(O10:O49\)/.test(oFormula && oFormula.formula ? oFormula.formula : ""), true);
}

(async () => {
  const template = fs.readFileSync(TEMPLATE_PATH);
  const jsFile = path.join(BUILD_DIR, "js-export.xlsx");
  const pyFile = path.join(BUILD_DIR, "py-export.xlsx");
  const pyPayload = path.join(BUILD_DIR, "py-payload.json");

  const jsResult = await exportXlsxJs(template, payload);
  fs.writeFileSync(jsFile, jsResult.buffer);
  console.log(`JS exporter wrote ${jsFile} (${jsResult.rowsWritten} rows, warnings=${JSON.stringify(jsResult.warnings)})`);

  fs.writeFileSync(pyPayload, JSON.stringify({ templatePath: path.resolve(TEMPLATE_PATH), payload }));
  const pythonBin = process.env.PYTHON_BIN || "python";
  const out = execFileSync(
    pythonBin,
    ["scripts/export_wochenbericht.py", "--payload-file", pyPayload, "--output", pyFile],
    { encoding: "utf8" }
  );
  console.log("Python exporter wrote " + pyFile + " -> " + out.trim());

  await inspect("JS", jsFile);
  await inspect("PY", pyFile);

  console.log("");
  if (failures.length) {
    console.log(`RESULT: ${failures.length} FAILED CHECK(S):`);
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  console.log("RESULT: ALL CHECKS PASSED (both exporters agree; Urlaub/Krank count 8h into the weekly total).");
})().catch((err) => {
  console.error("HARNESS ERROR:", err);
  process.exit(1);
});
