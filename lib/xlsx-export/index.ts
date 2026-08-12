import ExcelJS from "exceljs";
import type { Form1322Summary, Form1325Row, ValuedCashflowRow } from "@/lib/forms/types";

export interface WorkbookInput {
  form1325Rows: Form1325Row[];
  form1322Summary: Form1322Summary;
  dividendRows: ValuedCashflowRow[];
  interestRows: ValuedCashflowRow[];
  withholdingTaxRows: ValuedCashflowRow[];
}

const ILS_FORMAT = '#,##0.00 "₪"';
const USD_FORMAT = '"$"#,##0.00';
const DATE_FORMAT = "dd/mm/yyyy";
const RATE_FORMAT = "0.0000";

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { horizontal: "center" };
}

function applyRtlAndFreeze(sheet: ExcelJS.Worksheet) {
  sheet.views = [{ rightToLeft: true, state: "frozen", ySplit: 1 }];
}

function alignNumericColumns(sheet: ExcelJS.Worksheet) {
  sheet.columns.forEach((col) => {
    if (col.style?.numFmt) col.alignment = { horizontal: "right" };
  });
}

function addForm1325Sheet(workbook: ExcelJS.Workbook, rows: Form1325Row[]) {
  const sheet = workbook.addWorksheet("1325");
  sheet.columns = [
    { header: "זיהוי נייר ערך", key: "securityId", width: 28 },
    { header: "תאריך רכישה", key: "buyDate", width: 14, style: { numFmt: DATE_FORMAT } },
    { header: "תאריך מכירה", key: "sellDate", width: 14, style: { numFmt: DATE_FORMAT } },
    { header: "ערך נקוב בקניה ($)", key: "buyValueUsd", width: 16, style: { numFmt: USD_FORMAT } },
    { header: "ערך נקוב במכירה ($)", key: "sellValueUsd", width: 16, style: { numFmt: USD_FORMAT } },
    { header: "מחיר מקורי (₪)", key: "originalCostILS", width: 16, style: { numFmt: ILS_FORMAT } },
    { header: "שער ביום הקנייה", key: "buyRateILS", width: 14, style: { numFmt: RATE_FORMAT } },
    { header: "שער ביום המכירה", key: "sellRateILS", width: 14, style: { numFmt: RATE_FORMAT } },
    { header: '1+ שיעור עליית המדד', key: "linkageRatio", width: 16, style: { numFmt: RATE_FORMAT } },
    { header: "מחיר מתואם (₪)", key: "adjustedCostILS", width: 16, style: { numFmt: ILS_FORMAT } },
    { header: "תמורה (₪)", key: "proceedsILS", width: 16, style: { numFmt: ILS_FORMAT } },
    { header: "רווח הון ריאלי (₪)", key: "realGainILS", width: 16, style: { numFmt: ILS_FORMAT } },
    { header: "הפסד הון (₪)", key: "realLossILS", width: 16, style: { numFmt: ILS_FORMAT } },
  ];

  for (const row of rows) {
    sheet.addRow({ ...row, buyDate: new Date(row.buyDate), sellDate: new Date(row.sellDate) });
  }

  styleHeaderRow(sheet.getRow(1));
  applyRtlAndFreeze(sheet);
  alignNumericColumns(sheet);
}

function addForm1322Sheet(workbook: ExcelJS.Workbook, summary: Form1322Summary) {
  const sheet = workbook.addWorksheet("1322");
  sheet.columns = [
    { header: "פרמטר", key: "label", width: 42 },
    { header: "סכום", key: "value", width: 20 },
  ];

  const entries: { label: string; value: number | string; numFmt?: string }[] = [
    { label: "שנת מס", value: summary.taxYear, numFmt: "0" },
    { label: 'סה"כ רווח הון ריאלי', value: summary.totalRealGainILS, numFmt: ILS_FORMAT },
    { label: 'סה"כ הפסד הון', value: summary.totalRealLossILS, numFmt: ILS_FORMAT },
    { label: "תוצאה הונית נטו לשנה", value: summary.netCapitalResultILS, numFmt: ILS_FORMAT },
    { label: "הפסד מועבר משנים קודמות", value: summary.priorYearLossCarriedForwardILS, numFmt: ILS_FORMAT },
    { label: "הפסד מנוצל השנה", value: summary.lossAppliedThisYearILS, numFmt: ILS_FORMAT },
    { label: "יתרת הפסד להעברה לשנה הבאה", value: summary.remainingLossToCarryForwardILS, numFmt: ILS_FORMAT },
    { label: 'סה"כ תמורת מכירות (מחזור)', value: summary.totalSaleProceedsILS, numFmt: ILS_FORMAT },
    { label: 'סה"כ דיבידנדים', value: summary.totalDividendsILS, numFmt: ILS_FORMAT },
    { label: 'סה"כ ריבית', value: summary.totalInterestILS, numFmt: ILS_FORMAT },
    { label: 'סה"כ מס זר שנוכה במקור', value: summary.totalForeignTaxWithheldILS, numFmt: ILS_FORMAT },
    {
      label: "חוצה סף פטור מהגשה (לפי מחזור מכירות)",
      value: summary.exceedsSecuritiesProceedsExemptionThreshold ? "כן" : "לא",
    },
  ];

  for (const entry of entries) {
    const row = sheet.addRow({ label: entry.label, value: entry.value });
    if (entry.numFmt) row.getCell("value").numFmt = entry.numFmt;
  }

  styleHeaderRow(sheet.getRow(1));
  applyRtlAndFreeze(sheet);
  sheet.getColumn("value").alignment = { horizontal: "right" };
}

function addCashflowsSheet(
  workbook: ExcelJS.Workbook,
  dividends: ValuedCashflowRow[],
  interest: ValuedCashflowRow[],
  withholding: ValuedCashflowRow[]
) {
  const sheet = workbook.addWorksheet("דיבידנדים וריבית");
  sheet.columns = [
    { header: "סוג", key: "type", width: 14 },
    { header: "תאריך", key: "date", width: 14, style: { numFmt: DATE_FORMAT } },
    { header: "סימול", key: "symbol", width: 14 },
    { header: "תיאור", key: "description", width: 38 },
    { header: "סכום ($)", key: "amountUsd", width: 14, style: { numFmt: USD_FORMAT } },
    { header: "שער", key: "rateILS", width: 12, style: { numFmt: RATE_FORMAT } },
    { header: "סכום (₪)", key: "amountILS", width: 16, style: { numFmt: ILS_FORMAT } },
  ];

  const addRows = (type: string, rows: ValuedCashflowRow[]) => {
    for (const r of rows) {
      sheet.addRow({
        type,
        date: new Date(r.date),
        symbol: r.symbol,
        description: r.description,
        amountUsd: r.amountUsd,
        rateILS: r.rateILS,
        amountILS: r.amountILS,
      });
    }
  };

  addRows("דיבידנד", dividends);
  addRows("ריבית", interest);
  addRows("מס זר במקור", withholding);

  styleHeaderRow(sheet.getRow(1));
  applyRtlAndFreeze(sheet);
  alignNumericColumns(sheet);
}

export function buildWorkbook(input: WorkbookInput): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "IBKR → Israeli Tax Report Converter";
  workbook.created = new Date();

  addForm1325Sheet(workbook, input.form1325Rows);
  addForm1322Sheet(workbook, input.form1322Summary);
  addCashflowsSheet(workbook, input.dividendRows, input.interestRows, input.withholdingTaxRows);

  return workbook;
}

export async function workbookToBlob(workbook: ExcelJS.Workbook): Promise<Blob> {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Browser-only: triggers a file download for the given blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
