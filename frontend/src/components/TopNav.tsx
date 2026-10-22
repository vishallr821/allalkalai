import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import type { Profile } from "../lib/supabase";
import Button from "./ui/Button";
import Badge from "./ui/Badge";
import { LanguageToggle } from "./ui/LanguageToggle";
import { useLanguage } from "../lib/i18n";
import { ExternalLink, LogOut } from "lucide-react";

export default function TopNav() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiInfo, setAiInfo] = useState<{ isDemo: boolean; label: string } | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (data) {
          setProfile(data);
        }
      } catch (err) {
        console.error("Error fetching profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    const fetchHealth = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
        const res = await fetch(`${apiUrl}/api/health`);
        if (res.ok) {
          const data = await res.json();
          const isDemo = Boolean(data.demoMode || data.aiProvider?.includes("rule"));
          setAiInfo({
            isDemo,
            label: isDemo ? "Demo AI" : "Live AI",
          });
        }
      } catch {
        // fallback
      }
    };
    fetchHealth();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  if (loading) {
    return (
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 h-16 flex items-center justify-between" />
    );
  }

  if (!profile) {
    return null;
  }

  const roleLabel = profile.role
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const roleClassMap: Record<string, string> = {
    citizen: "bg-indigo-50 text-indigo-700 border-indigo-200",
    officer: "bg-blue-50 text-blue-700 border-blue-200",
    dept_head: "bg-amber-50 text-amber-700 border-amber-200",
    official: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };

  const roleClassName = roleClassMap[profile.role] || "bg-slate-100 text-slate-700";

  return (
    <nav className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto flex justify-between items-center gap-2">
        {/* Brand & Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white shadow-xs font-bold text-sm shrink-0">
            அ
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight font-serif leading-none">
              {t.appName}
            </h1>
            <p className="text-[10px] text-slate-500 hidden sm:block leading-tight mt-0.5">
              {t.appSubtitle}
            </p>
          </div>
        </div>

        {/* Right Actions & Profile */}
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            to="/public"
            className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-600 hover:text-emerald-700 font-medium px-2 py-1 rounded-md hover:bg-slate-50 transition-colors"
          >
            <span>{t.publicDashboard}</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </Link>

          <LanguageToggle />

          {aiInfo && (
            <div
              title={aiInfo.isDemo ? "Deterministic rule-based offline engine active" : "Connected to Live AI"}
              className={`hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                aiInfo.isDemo
                  ? "bg-amber-50 text-amber-800 border-amber-200"
                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  aiInfo.isDemo ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                }`}
              />
              <span>{aiInfo.label}</span>
            </div>
          )}

          <div className="hidden sm:block text-right text-xs">
            <p className="font-semibold text-slate-900">{profile.name}</p>
            <div className="flex items-center gap-1.5 justify-end">
              <Badge label={roleLabel} className={roleClassName} />
              {profile.department && (
                <span className="text-[11px] text-slate-500 font-medium">{profile.department}</span>
              )}
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={handleLogout}
            className="text-xs px-2.5 py-1 text-slate-600 hover:text-red-700"
          >
            <LogOut size={14} className="sm:mr-1" />
            <span className="hidden sm:inline">{t.signOut}</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
