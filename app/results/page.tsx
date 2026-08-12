"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SummaryCards } from "@/components/SummaryCards";
import { ThresholdBanner } from "@/components/ThresholdBanner";
import { ResultsTabs } from "@/components/ResultsTabs";
import { computeResultsForYear, type YearlyComputation } from "@/lib/compute";
import { getResult } from "@/lib/persistence/repository";
import { getTaxYearConfig } from "@/config/tax-parameters";
import { buildWorkbook, downloadBlob, workbookToBlob } from "@/lib/xlsx-export";

function ResultsContent() {
  const searchParams = useSearchParams();
  const yearParam = searchParams.get("year");
  const year = yearParam ? Number(yearParam) : null;

  const [data, setData] = useState<YearlyComputation | null>(null);
  const [loading, setLoading] = useState(year !== null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (year === null) return;
    let cancelled = false;
    (async () => {
      try {
        const existing = await getResult(year);
        const result = await computeResultsForYear(year, existing?.priorYearLossCarriedForwardILS ?? 0);
        if (cancelled) return;
        setData(result);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const handleExport = async () => {
    if (!data) return;
    setExporting(true);
    try {
      const workbook = buildWorkbook({
        form1325Rows: data.form1325Rows,
        form1322Summary: data.form1322Summary,
        dividendRows: data.dividendRows,
        interestRows: data.interestRows,
        withholdingTaxRows: data.withholdingTaxRows,
      });
      const blob = await workbookToBlob(workbook);
      downloadBlob(blob, `דוח-מס-רווחי-הון-${data.taxYear}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  if (year === null) {
    return <p className="text-slate-500">בחרו שנת מס במסך התצוגה המקדימה כדי לראות תוצאות.</p>;
  }
  if (loading) {
    return <p className="text-slate-500">מחשב תוצאות...</p>;
  }
  if (error) {
    return <p className="text-red-600">{error}</p>;
  }
  if (!data) {
    return null;
  }

  let exemptionThresholdILS = 0;
  try {
    exemptionThresholdILS = getTaxYearConfig(year).securitiesProceedsExemptionFromFilingILS;
  } catch {
    // no config for this year — banner simply won't show a comparison
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">תוצאות עבור שנת {year}</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:bg-slate-300"
        >
          {exporting ? "מייצא..." : "ייצוא ל-Excel ↓"}
        </button>
      </div>

      <ThresholdBanner
        totalSaleProceedsILS={data.form1322Summary.totalSaleProceedsILS}
        thresholdILS={exemptionThresholdILS}
        exceeds={data.form1322Summary.exceedsSecuritiesProceedsExemptionThreshold}
      />

      <SummaryCards
        netCapitalResultILS={data.form1322Summary.netCapitalResultILS}
        totalCommissionsUsd={data.totalCommissionsUsd}
        totalForeignTaxWithheldILS={data.form1322Summary.totalForeignTaxWithheldILS}
        transactionCount={data.form1325Rows.length}
      />

      <ResultsTabs
        form1325Rows={data.form1325Rows}
        form1322Summary={data.form1322Summary}
        dividendRows={data.dividendRows}
        interestRows={data.interestRows}
        withholdingTaxRows={data.withholdingTaxRows}
      />
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">טוען...</p>}>
      <ResultsContent />
    </Suspense>
  );
}
