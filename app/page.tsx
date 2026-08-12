"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UploadDropzone } from "@/components/UploadDropzone";
import { isLikelyIbkrStatement, parseIbkrStatement } from "@/lib/ibkr-parser";
import { getAllStatements, saveStatement, deleteStatement, clearAllStatementData } from "@/lib/persistence/repository";
import type { StoredStatement } from "@/lib/persistence/db";
import { formatDate } from "@/lib/format";

export default function UploadPage() {
  const [statements, setStatements] = useState<StoredStatement[]>([]);
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<{ type: "error" | "warning" | "success"; text: string }[]>([]);

  const refresh = async () => {
    setStatements(await getAllStatements());
  };

  useEffect(() => {
    (async () => {
      setStatements(await getAllStatements());
    })();
  }, []);

  const handleFiles = async (files: File[]) => {
    setBusy(true);
    const newMessages: typeof messages = [];

    for (const file of files) {
      try {
        const text = await file.text();
        if (!isLikelyIbkrStatement(text)) {
          newMessages.push({
            type: "error",
            text: `הקובץ "${file.name}" אינו נראה כמו IBKR Activity Statement (לא נמצאו סקשנים מוכרים) — הקובץ לא נטען.`,
          });
          continue;
        }
        const parsed = parseIbkrStatement(text, file.name);
        await saveStatement(parsed, file.name);
        newMessages.push({
          type: "success",
          text: `"${file.name}" נטען בהצלחה: ${parsed.trades.length} עסקאות, ${parsed.dividends.length} דיבידנדים.`,
        });
        for (const w of parsed.warnings) newMessages.push({ type: "warning", text: `${file.name}: ${w}` });
      } catch (err) {
        newMessages.push({
          type: "error",
          text: `שגיאה בקריאת הקובץ "${file.name}": ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    setMessages(newMessages);
    await refresh();
    setBusy(false);
  };

  const handleDelete = async (id?: number) => {
    if (id === undefined) return;
    await deleteStatement(id);
    await refresh();
  };

  const handleClearAll = async () => {
    if (!confirm("למחוק את כל הנתונים המקומיים שהועלו עד כה? הפעולה בלתי הפיכה (אך ניתן להעלות מחדש את הקבצים).")) return;
    await clearAllStatementData();
    await refresh();
    setMessages([]);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">העלאת דוחות IBKR</h1>
        <p className="mt-1 text-slate-600">
          העלו קובץ Activity Statement אחד או יותר בפורמט CSV (למשל שני דוחות חצי-שנתיים המרכיבים יחד שנה מלאה).
          הנתונים נשמרים מקומית בדפדפן בלבד ואינם נשלחים לשום שרת חיצוני, פרט לבקשת שערי חליפין מבנק ישראל.
        </p>
      </div>

      <UploadDropzone onFiles={handleFiles} disabled={busy} />

      {messages.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {messages.map((m, i) => (
            <li
              key={i}
              className={
                m.type === "error"
                  ? "text-red-600"
                  : m.type === "warning"
                    ? "text-amber-600"
                    : "text-emerald-600"
              }
            >
              {m.text}
            </li>
          ))}
        </ul>
      )}

      {statements.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="font-semibold text-slate-800">קבצים שהועלו</h2>
            <button onClick={handleClearAll} className="text-sm text-red-600 hover:underline">
              מחיקת כל הנתונים
            </button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500">
                <th className="px-4 py-2 text-right font-medium">קובץ</th>
                <th className="px-4 py-2 text-right font-medium">הועלה</th>
                <th className="px-4 py-2 text-right font-medium">עסקאות</th>
                <th className="px-4 py-2 text-right font-medium">דיבידנדים</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {statements.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2">{s.sourceFile}</td>
                  <td className="px-4 py-2 text-slate-500">
                    <span className="ltr-inline">{formatDate(s.uploadedAt.slice(0, 10))}</span>
                  </td>
                  <td className="px-4 py-2">{s.trades.length}</td>
                  <td className="px-4 py-2">{s.dividends.length}</td>
                  <td className="px-4 py-2 text-left">
                    <button onClick={() => handleDelete(s.id)} className="text-red-500 hover:underline">
                      הסרה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <Link
          href="/preview"
          className={`inline-flex items-center rounded-lg px-5 py-2.5 text-sm font-semibold text-white ${
            statements.length > 0 ? "bg-blue-600 hover:bg-blue-700" : "pointer-events-none bg-slate-300"
          }`}
        >
          המשך לתצוגה מקדימה ←
        </Link>
      </div>
    </div>
  );
}
