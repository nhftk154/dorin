"use client";

import { useState } from "react";
import type { Form1322Summary, Form1325Row, ValuedCashflowRow } from "@/lib/forms/types";
import { formatDate, formatILS, formatNumber, formatUSD } from "@/lib/format";

interface ResultsTabsProps {
  form1325Rows: Form1325Row[];
  form1322Summary: Form1322Summary;
  dividendRows: ValuedCashflowRow[];
  interestRows: ValuedCashflowRow[];
  withholdingTaxRows: ValuedCashflowRow[];
}

type Tab = "1325" | "1322" | "cashflows";

const TABS: { id: Tab; label: string }[] = [
  { id: "1325", label: "עסקאות מפורטות (1325)" },
  { id: "1322", label: "סיכום שנתי (1322)" },
  { id: "cashflows", label: "דיבידנדים וריבית" },
];

export function ResultsTabs({
  form1325Rows,
  form1322Summary,
  dividendRows,
  interestRows,
  withholdingTaxRows,
}: ResultsTabsProps) {
  const [tab, setTab] = useState<Tab>("1325");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.id ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "1325" && <Form1325Table rows={form1325Rows} />}
      {tab === "1322" && <Form1322View summary={form1322Summary} />}
      {tab === "cashflows" && (
        <CashflowsTable dividends={dividendRows} interest={interestRows} withholding={withholdingTaxRows} />
      )}
    </div>
  );
}

function Form1325Table({ rows }: { rows: Form1325Row[] }) {
  if (rows.length === 0) return <p className="text-slate-500">אין עסקאות סגורות לשנה זו.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <th className="px-3 py-2 text-right font-medium">נייר ערך</th>
            <th className="px-3 py-2 text-right font-medium">תאריך רכישה</th>
            <th className="px-3 py-2 text-right font-medium">תאריך מכירה</th>
            <th className="px-3 py-2 text-right font-medium">שער קנייה</th>
            <th className="px-3 py-2 text-right font-medium">שער מכירה</th>
            <th className="px-3 py-2 text-right font-medium">מחיר מתואם (₪)</th>
            <th className="px-3 py-2 text-right font-medium">תמורה (₪)</th>
            <th className="px-3 py-2 text-right font-medium">רווח הון (₪)</th>
            <th className="px-3 py-2 text-right font-medium">הפסד הון (₪)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              <td className="px-3 py-2">
                <span className="ltr-inline">{r.securityId}</span>
              </td>
              <td className="px-3 py-2">
                <span className="ltr-inline">{formatDate(r.buyDate)}</span>
              </td>
              <td className="px-3 py-2">
                <span className="ltr-inline">{formatDate(r.sellDate)}</span>
              </td>
              <td className="px-3 py-2">{formatNumber(r.buyRateILS)}</td>
              <td className="px-3 py-2">{formatNumber(r.sellRateILS)}</td>
              <td className="px-3 py-2">{formatILS(r.adjustedCostILS)}</td>
              <td className="px-3 py-2">{formatILS(r.proceedsILS)}</td>
              <td className="px-3 py-2 text-emerald-600">{r.realGainILS > 0 ? formatILS(r.realGainILS) : ""}</td>
              <td className="px-3 py-2 text-red-600">{r.realLossILS > 0 ? formatILS(r.realLossILS) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <tr className="border-b border-slate-50 last:border-0">
      <td className={`px-4 py-2 ${emphasis ? "font-semibold text-slate-900" : "text-slate-600"}`}>{label}</td>
      <td className={`px-4 py-2 text-left ltr-inline ${emphasis ? "font-semibold" : ""}`}>{value}</td>
    </tr>
  );
}

function Form1322View({ summary }: { summary: Form1322Summary }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full max-w-xl text-sm">
        <tbody>
          <SummaryRow label="שנת מס" value={String(summary.taxYear)} />
          <SummaryRow label='סה"כ רווח הון ריאלי' value={formatILS(summary.totalRealGainILS)} />
          <SummaryRow label='סה"כ הפסד הון' value={formatILS(summary.totalRealLossILS)} />
          <SummaryRow label="תוצאה הונית נטו לשנה" value={formatILS(summary.netCapitalResultILS)} emphasis />
          <SummaryRow label="הפסד מועבר משנים קודמות" value={formatILS(summary.priorYearLossCarriedForwardILS)} />
          <SummaryRow label="הפסד מנוצל השנה" value={formatILS(summary.lossAppliedThisYearILS)} />
          <SummaryRow label="יתרת הפסד להעברה לשנה הבאה" value={formatILS(summary.remainingLossToCarryForwardILS)} />
          <SummaryRow label='סה"כ תמורת מכירות (מחזור)' value={formatILS(summary.totalSaleProceedsILS)} />
          <SummaryRow label='סה"כ דיבידנדים' value={formatILS(summary.totalDividendsILS)} />
          <SummaryRow label='סה"כ ריבית' value={formatILS(summary.totalInterestILS)} />
          <SummaryRow label='סה"כ מס זר שנוכה במקור' value={formatILS(summary.totalForeignTaxWithheldILS)} />
        </tbody>
      </table>
    </div>
  );
}

function CashflowsTable({
  dividends,
  interest,
  withholding,
}: {
  dividends: ValuedCashflowRow[];
  interest: ValuedCashflowRow[];
  withholding: ValuedCashflowRow[];
}) {
  const rows = [
    ...dividends.map((r) => ({ ...r, type: "דיבידנד" })),
    ...interest.map((r) => ({ ...r, type: "ריבית" })),
    ...withholding.map((r) => ({ ...r, type: "מס זר במקור" })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  if (rows.length === 0) return <p className="text-slate-500">אין דיבידנדים או ריבית לשנה זו.</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[800px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <th className="px-3 py-2 text-right font-medium">סוג</th>
            <th className="px-3 py-2 text-right font-medium">תאריך</th>
            <th className="px-3 py-2 text-right font-medium">סימול</th>
            <th className="px-3 py-2 text-right font-medium">תיאור</th>
            <th className="px-3 py-2 text-right font-medium">סכום ($)</th>
            <th className="px-3 py-2 text-right font-medium">סכום (₪)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-slate-50 last:border-0">
              <td className="px-3 py-2">{r.type}</td>
              <td className="px-3 py-2">
                <span className="ltr-inline">{formatDate(r.date)}</span>
              </td>
              <td className="px-3 py-2">
                <span className="ltr-inline">{r.symbol}</span>
              </td>
              <td className="px-3 py-2 text-slate-500">{r.description}</td>
              <td className="px-3 py-2">{formatUSD(r.amountUsd)}</td>
              <td className="px-3 py-2">{formatILS(r.amountILS)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
