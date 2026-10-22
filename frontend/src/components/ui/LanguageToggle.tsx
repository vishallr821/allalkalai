import React from "react";
import { useLanguage } from "../../lib/i18n";
import { Languages } from "lucide-react";

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = "" }) => {
  const { lang, toggleLanguage } = useLanguage();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-all border shadow-sm ${
        lang === "ta"
          ? "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
          : "bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200"
      } ${className}`}
      title={lang === "en" ? "Switch to Tamil (தமிழ்)" : "Switch to English"}
      aria-label="Toggle language"
    >
      <Languages className="w-3.5 h-3.5 text-slate-600" />
      <span>{lang === "en" ? "தமிழ்" : "English"}</span>
    </button>
  );
};
