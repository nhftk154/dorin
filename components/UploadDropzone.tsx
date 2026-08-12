"use client";

import { useCallback, useRef, useState } from "react";

interface UploadDropzoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function UploadDropzone({ onFiles, disabled }: UploadDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const files = Array.from(event.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith(".csv"));
      if (files.length > 0) onFiles(files);
    },
    [onFiles, disabled]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
        disabled ? "cursor-not-allowed opacity-50 border-slate-200" : "cursor-pointer"
      } ${isDragOver ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:border-slate-400"}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        multiple
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFiles(files);
          e.target.value = "";
        }}
      />
      <svg
        className="h-10 w-10 text-slate-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 8.25 12 3.75m0 0L7.5 8.25M12 3.75v13.5"
        />
      </svg>
      <p className="text-base font-medium text-slate-700">גררו לכאן קובצי CSV או לחצו לבחירה</p>
      <p className="text-sm text-slate-400">ניתן להעלות כמה קבצים בו-זמנית (למשל שני דוחות חצי-שנתיים)</p>
    </div>
  );
}
