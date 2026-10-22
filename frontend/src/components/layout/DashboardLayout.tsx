import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import type { Profile } from "../../lib/supabase";
import { Menu, X, LayoutDashboard, ClipboardList, LogOut, ExternalLink } from "lucide-react";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { LanguageToggle } from "../ui/LanguageToggle";
import { useLanguage } from "../../lib/i18n";

interface DashboardLayoutProps {
  children: ReactNode;
  role: "dept_head" | "officer";
}

export default function DashboardLayout({ children, role }: DashboardLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
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
    };

    fetchProfile();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const isActive = (path: string) => location.pathname === path;

  const navLinks =
    role === "dept_head"
      ? [
          {
            label: t.deptHeadDashboard,
            path: "/depthead/dashboard",
            icon: LayoutDashboard,
          },
        ]
      : [
          {
            label: t.officerDashboard,
            path: "/officer/dashboard",
            icon: ClipboardList,
          },
        ];

  const roleLabel = profile?.role
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  const roleClassMap: Record<string, string> = {
    citizen: "bg-indigo-50 text-indigo-700",
    officer: "bg-blue-50 text-blue-700",
    dept_head: "bg-amber-50 text-amber-700",
    official: "bg-emerald-50 text-emerald-700",
  };

  const roleClassName = roleClassMap[profile?.role || ""] || "bg-slate-100 text-slate-700";

  return (
    <div className="flex h-screen bg-slate-50 font-sans">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 flex-col justify-between">
        <div>
          {/* Header */}
          <div className="p-5 border-b border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white shadow-xs font-bold text-sm">
                அ
              </div>
              <div>
                <h1 className="font-bold text-slate-900 font-serif leading-none">
                  {t.appName}
                </h1>
                <p className="text-[10px] text-slate-500 mt-0.5 leading-none">
                  {role === "dept_head" ? t.deptHeadDashboard : t.officerDashboard}
                </p>
              </div>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="py-4 space-y-1 px-3">
            {navLinks.map(({ label, path, icon: Icon }) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center gap-3 transition-colors text-xs font-semibold ${
                  isActive(path)
                    ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon size={18} className={isActive(path) ? "text-emerald-700" : "text-slate-500"} />
                <span>{label}</span>
              </button>
            ))}

            <Link
              to="/public"
              className="w-full px-3 py-2.5 rounded-xl text-left flex items-center gap-3 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors text-xs font-semibold"
            >
              <ExternalLink size={18} className="text-slate-500" />
              <span>{t.publicDashboard}</span>
            </Link>
          </nav>
        </div>

        {/* User Info & Footer */}
        <div className="p-4 border-t border-slate-200 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-500">Language:</span>
            <LanguageToggle />
          </div>

          {profile && (
            <div className="space-y-1">
              <p className="font-semibold text-slate-900 text-xs truncate">{profile.name}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge label={roleLabel || "User"} className={roleClassName} />
                {profile.department && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 font-medium">
                    {profile.department}
                  </span>
                )}
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="w-full text-xs justify-start px-2 py-1.5 text-slate-600 hover:text-red-700 hover:bg-red-50"
          >
            <LogOut size={14} className="mr-2" />
            {t.signOut}
          </Button>
        </div>
      </aside>

      {/* Mobile Top Bar & Main Container */}
      <div className="flex-1 flex flex-col md:hidden overflow-hidden">
        {/* Mobile Top Bar */}
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-700 flex items-center justify-center text-white font-bold text-xs">
              அ
            </div>
            <h1 className="font-bold text-slate-900 font-serif text-sm">{t.appName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <LanguageToggle />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 text-slate-600 rounded-lg hover:bg-slate-100"
              aria-label="Toggle navigation"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="absolute top-14 left-0 right-0 bg-white border-b border-slate-200 z-50 shadow-lg animate-in slide-in-from-top-2 duration-150">
            <nav className="py-2 px-3 space-y-1">
              {navLinks.map(({ label, path, icon: Icon }) => (
                <button
                  key={path}
                  onClick={() => {
                    navigate(path);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-3 text-xs font-semibold ${
                    isActive(path)
                      ? "bg-emerald-50 text-emerald-900 font-medium"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}

              <Link
                to="/public"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full px-3 py-2.5 rounded-lg text-left flex items-center gap-3 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
              >
                <ExternalLink size={18} />
                <span>{t.publicDashboard}</span>
              </Link>
            </nav>

            {/* Mobile User Info */}
            <div className="px-4 py-3 border-t border-slate-200 space-y-2 bg-slate-50/50">
              {profile && (
                <div className="space-y-1">
                  <p className="font-semibold text-slate-900 text-xs">{profile.name}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge label={roleLabel || "User"} className={roleClassName} />
                    {profile.department && (
                      <span className="text-[10px] text-slate-500 font-medium">{profile.department}</span>
                    )}
                  </div>
                </div>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-xs justify-start px-2 py-1.5 text-slate-600 hover:text-red-700"
              >
                <LogOut size={14} className="mr-2" />
                {t.signOut}
              </Button>
            </div>
          </div>
        )}

        {/* Main Content (Mobile) */}
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4">
          {children}
        </main>
      </div>

      {/* Desktop Main Content */}
      <main className="hidden md:flex md:flex-1 md:overflow-y-auto md:p-8">
        <div className="w-full max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
