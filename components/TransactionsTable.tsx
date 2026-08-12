"use client";

import type { StoredTransaction } from "@/lib/persistence/db";
import { formatDate, formatNumber } from "@/lib/format";

interface TransactionsTableProps {
  transactions: StoredTransaction[];
  onToggleExcluded: (transactionId: string, excluded: boolean) => void;
}

export function TransactionsTable({ transactions, onToggleExcluded }: TransactionsTableProps) {
  if (transactions.length === 0) {
    return <p className="text-slate-500">לא נמצאו עסקאות. חזרו למסך ההעלאה כדי להעלות דוח.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-slate-500">
            <th className="px-3 py-2 text-right font-medium">כלול</th>
            <th className="px-3 py-2 text-right font-medium">תאריך</th>
            <th className="px-3 py-2 text-right font-medium">סימול</th>
            <th className="px-3 py-2 text-right font-medium">סוג נכס</th>
            <th className="px-3 py-2 text-right font-medium">כמות</th>
            <th className="px-3 py-2 text-right font-medium">מחיר ($)</th>
            <th className="px-3 py-2 text-right font-medium">עמלה ($)</th>
            <th className="px-3 py-2 text-right font-medium">קוד</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr
              key={t.transactionId}
              className={`border-b border-slate-50 last:border-0 ${t.excluded ? "bg-slate-50 text-slate-400" : ""}`}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={!t.excluded}
                  onChange={(e) => onToggleExcluded(t.transactionId, !e.target.checked)}
                  aria-label="כלול בחישוב"
                />
              </td>
              <td className="px-3 py-2">
                <span className="ltr-inline">{formatDate(t.tradeDate)}</span>
              </td>
              <td className="px-3 py-2">
                <span className="ltr-inline">{t.symbol}</span>
              </td>
              <td className="px-3 py-2">{t.assetCategory}</td>
              <td className="px-3 py-2">{formatNumber(t.quantity)}</td>
              <td className="px-3 py-2">{formatNumber(t.price)}</td>
              <td className="px-3 py-2">{formatNumber(t.commFee)}</td>
              <td className="px-3 py-2 text-slate-400">{t.code.join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
