import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "המרת דוח IBKR לדיווח מס רווחי הון",
  description: "המרת דוח פעילות שנתי מ-Interactive Brokers לפורמט מוכן לטפסים 1322 ו-1325",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${rubik.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
            <span className="text-lg font-bold text-slate-900">IBKR → דוח מס רווחי הון</span>
            <div className="flex gap-4 text-sm font-medium text-slate-600">
              <Link href="/" className="hover:text-slate-900">
                העלאת קבצים
              </Link>
              <Link href="/preview" className="hover:text-slate-900">
                תצוגה מקדימה
              </Link>
              <Link href="/results" className="hover:text-slate-900">
                תוצאות
              </Link>
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
          כלי עזר אישי לארגון נתונים — אינו תחליף לבדיקת רואה חשבון לפני הגשה בפועל
        </footer>
      </body>
    </html>
  );
}
