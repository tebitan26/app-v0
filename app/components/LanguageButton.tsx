"use client";

import { useEffect, useMemo, useState } from "react";

type Lang = "fr" | "en" | "es" | "el";

function buildGoogleTranslateUrl(target: Lang, currentUrl: string) {
  if (target === "fr") return currentUrl; // original
  const u = encodeURIComponent(currentUrl);
  return `https://translate.google.com/translate?sl=auto&tl=${target}&u=${u}`;
}

export function LanguageButton() {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  const currentUrl = mounted ? window.location.href : "";

  const options = useMemo(
    () =>
      [
        { code: "fr" as const, label: "FR (Original)" },
        { code: "en" as const, label: "EN" },
        { code: "es" as const, label: "ES" },
        { code: "el" as const, label: "EL" }, // Greek
      ] as const,
    []
  );

  if (!mounted) {
    return (
      <button className="opacity-70 text-sm px-3 py-2 rounded-lg border border-white/15">
        🌐
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm px-3 py-2 rounded-lg border border-white/15 hover:border-white/25"
        aria-label="Translate"
        title="Translate"
      >
        🌐 Translate
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 rounded-xl border border-white/10 bg-black/60 backdrop-blur p-2 shadow-lg z-50">
          {options.map((o) => (
            <button
              key={o.code}
              onClick={() => {
                setOpen(false);
                const url = buildGoogleTranslateUrl(o.code, currentUrl);
                window.open(url, "_blank", "noopener,noreferrer");
              }}
              className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}