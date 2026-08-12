import { formatILS, formatNumber, formatUSD } from "@/lib/format";

interface SummaryCardsProps {
  netCapitalResultILS: number;
  totalCommissionsUsd: number;
  totalForeignTaxWithheldILS: number;
  transactionCount: number;
}

function Card({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-2xl font-bold ltr-inline ${
          tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function SummaryCards({
  netCapitalResultILS,
  totalCommissionsUsd,
  totalForeignTaxWithheldILS,
  transactionCount,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card
        label="רווח/הפסד הון נטו לשנה"
        value={formatILS(netCapitalResultILS)}
        tone={netCapitalResultILS >= 0 ? "positive" : "negative"}
      />
      <Card label='סה"כ עמלות' value={formatUSD(totalCommissionsUsd)} />
      <Card label='סה"כ מס זר שנוכה' value={formatILS(totalForeignTaxWithheldILS)} />
      <Card label="מספר עסקאות סגורות" value={formatNumber(transactionCount)} />
    </div>
  );
}
