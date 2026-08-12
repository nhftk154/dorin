import { formatILS } from "@/lib/format";

interface ThresholdBannerProps {
  totalSaleProceedsILS: number;
  thresholdILS: number;
  exceeds: boolean;
}

export function ThresholdBanner({ totalSaleProceedsILS, thresholdILS, exceeds }: ThresholdBannerProps) {
  if (!exceeds) return null;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
      <p className="font-semibold">שימו לב: מחזור המכירות השנתי חוצה את סף הפטור מהגשה</p>
      <p className="mt-1 text-sm">
        סה&quot;כ תמורת מכירות השנה: <span className="ltr-inline font-medium">{formatILS(totalSaleProceedsILS)}</span> —
        חוצה את הסף המוגדר (<span className="ltr-inline">{formatILS(thresholdILS)}</span>). ייתכן שחלה עליכם חובת
        הגשת דוח שנתי. הסף מוגדר ב-config/tax-parameters.ts ומתעדכן מדי שנה — יש לוודא שהוא עדכני מול רשות המסים.
      </p>
    </div>
  );
}
