"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { TransactionsTable } from "@/components/TransactionsTable";
import { getAllTransactions, setTransactionExcluded } from "@/lib/persistence/repository";
import type { StoredTransaction } from "@/lib/persistence/db";
import { computeResultsForYear } from "@/lib/compute";

export default function PreviewPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<StoredTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [computing, setComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [priorYearLoss, setPriorYearLoss] = useState(0);

  useEffect(() => {
    (async () => {
      const all = await getAllTransactions();
      setTransactions(all);
      setLoading(false);
    })();
  }, []);

  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((t) => Number(t.tradeDate.slice(0, 4))).filter((y) => !Number.isNaN(y)));
    return [...years].sort((a, b) => b - a);
  }, [transactions]);

  const taxYear = selectedYear ?? availableYears[0] ?? null;

  const handleToggle = async (transactionId: string, excluded: boolean) => {
    await setTransactionExcluded(transactionId, excluded);
    setTransactions((prev) => prev.map((t) => (t.transactionId === transactionId ? { ...t, excluded } : t)));
  };

  const handleCompute = async () => {
    if (taxYear === null) return;
    setComputing(true);
    setError(null);
    try {
      await computeResultsForYear(taxYear, priorYearLoss);
      router.push(`/results?year=${taxYear}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setComputing(false);
    }
  };

  const includedCount = transactions.filter((t) => !t.excluded).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">תצוגה מקדימה של עסקאות</h1>
        <p className="mt-1 text-slate-600">
          כל העסקאות שזוהו מהקבצים שהועלו, לאחר איחוד והסרת כפילויות. ניתן לסמן עסקה כלא-כלולה בחישוב אם יש צורך.
        </p>
      </div>

      {loading ? (
        <p className="text-slate-500">טוען...</p>
      ) : (
        <>
          <TransactionsTable transactions={transactions} onToggleExcluded={handleToggle} />

          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">שנת מס</label>
              <select
                value={taxYear ?? ""}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              >
                {availableYears.length === 0 && <option value="">אין עסקאות</option>}
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">הפסד הון מועבר משנים קודמות (₪)</label>
              <input
                type="number"
                value={priorYearLoss}
                onChange={(e) => setPriorYearLoss(Number(e.target.value) || 0)}
                className="w-48 rounded border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            <p className="text-sm text-slate-500">{includedCount} עסקאות כלולות בחישוב מתוך {transactions.length}</p>

            <button
              onClick={handleCompute}
              disabled={computing || taxYear === null || transactions.length === 0}
              className="mr-auto inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {computing ? "מחשב..." : "חשב תוצאות ←"}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </>
      )}
    </div>
  );
}
