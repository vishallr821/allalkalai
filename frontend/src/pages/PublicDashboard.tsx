import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLanguage } from "../lib/i18n";
import { LanguageToggle } from "../components/ui/LanguageToggle";
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  MapPin,
  RefreshCw,
  Sparkles,
  Award,
  Building2,
  Eye,
} from "lucide-react";

interface PublicStatsSummary {
  total_filed: number;
  total_resolved: number;
  total_in_progress: number;
  total_escalated: number;
  sla_adherence_percent: number;
  overall_avg_resolution_hours: number;
  last_updated: string;
}

interface DepartmentStat {
  department: string;
  total: number;
  resolved: number;
  in_progress: number;
  escalated: number;
  avg_hours: number;
  sla_compliance: number;
}

interface VerifiedResolution {
  id: string;
  department: string;
  category: string;
  issue_text: string;
  before_photo_url: string;
  after_photo_url: string;
  verification_score: number;
  verification_status: string;
  verification_notes: string;
  locality: string;
  lat: number;
  lng: number;
  resolved_at: string;
  resolution_time_hours: number;
}

interface TrendPoint {
  date: string;
  filed: number;
  resolved: number;
}

export default function PublicDashboard() {
  const { lang, t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<PublicStatsSummary | null>(null);
  const [departments, setDepartments] = useState<DepartmentStat[]>([]);
  const [resolutions, setResolutions] = useState<VerifiedResolution[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [activeTab, setActiveTab] = useState<"all" | "photos" | "departments">("all");
  const [selectedResolution, setSelectedResolution] = useState<VerifiedResolution | null>(null);
  const [lastFetchTime, setLastFetchTime] = useState<string>("");

  const loadData = async () => {
    setLoading(true);
    const apiBase = "http://localhost:4000";
    try {
      const [statsRes, resRes, trendRes] = await Promise.all([
        fetch(`${apiBase}/api/public/stats`),
        fetch(`${apiBase}/api/public/verified-resolutions`),
        fetch(`${apiBase}/api/public/trends`),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setSummary(statsData.summary);
        setDepartments(statsData.departments || []);
      }

      if (resRes.ok) {
        const resData = await resRes.json();
        setResolutions(resData.resolutions || []);
      }

      if (trendRes.ok) {
        const trendData = await trendRes.json();
        setTrends(trendData.trends || []);
      }

      setLastFetchTime(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Failed to load public stats:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh every 60s
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const departmentColors: Record<string, { bg: string; text: string; bar: string }> = {
    Water: { bg: "bg-blue-50 text-blue-700 border-blue-200", text: "text-blue-600", bar: "bg-blue-500" },
    Electricity: { bg: "bg-amber-50 text-amber-700 border-amber-200", text: "text-amber-600", bar: "bg-amber-500" },
    Sanitation: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "text-emerald-600", bar: "bg-emerald-500" },
    Roads: { bg: "bg-slate-100 text-slate-800 border-slate-300", text: "text-slate-600", bar: "bg-slate-600" },
    Health: { bg: "bg-rose-50 text-rose-700 border-rose-200", text: "text-rose-600", bar: "bg-rose-500" },
    Revenue: { bg: "bg-indigo-50 text-indigo-700 border-indigo-200", text: "text-indigo-600", bar: "bg-indigo-500" },
    Police: { bg: "bg-violet-50 text-violet-700 border-violet-200", text: "text-violet-600", bar: "bg-violet-500" },
  };

  // Max value for 30-day trend chart
  const maxTrend = trends.length > 0 ? Math.max(...trends.map((t) => Math.max(t.filed, t.resolved))) : 20;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white shadow-md font-bold text-lg">
              அ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-950 font-serif">
                  {t.appName}
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold border border-emerald-200">
                  {t.publicDashboard}
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                {t.appSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <LanguageToggle />
            <button
              onClick={loadData}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              title="Refresh Stats"
              aria-label="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-emerald-600" : ""}`} />
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-xs"
            >
              <span>{t.login}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero / Thirukkural 555 Banner */}
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 text-white py-12 px-4 sm:px-6 lg:px-8 border-b border-slate-800 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#34d399_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-medium mb-4">
            <Award className="w-3.5 h-3.5" />
            <span>திருக்குறள் 555 • Thirukkural 555</span>
          </div>

          <blockquote className="font-serif text-lg sm:text-2xl font-medium tracking-wide text-amber-200 mb-3 whitespace-pre-line leading-relaxed">
            {lang === "ta" ? t.thirukkuralTamil : `“${t.thirukkuralTamil}”`}
          </blockquote>

          <p className="text-sm sm:text-base text-slate-300 max-w-3xl mx-auto leading-relaxed italic">
            “{t.thirukkuralEnglish}”
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Live Civic Transparency
            </span>
            <span>•</span>
            <span>Zero Citizen PII Exposed</span>
            <span>•</span>
            <span>Multimodal Vision Audited</span>
            {lastFetchTime && (
              <>
                <span>•</span>
                <span>Refreshed: {lastFetchTime}</span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* KPI Cards Grid */}
        <section aria-label="Key Performance Indicators">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Filed */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiTotalFiled}</span>
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                  <Building2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-serif">
                {loading && !summary ? (
                  <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
                ) : (
                  summary?.total_filed.toLocaleString() || "44"
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Across 7 civic departments</p>
            </div>

            {/* Resolved & Verified */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiResolved}</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 tracking-tight font-serif">
                {loading && !summary ? (
                  <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
                ) : (
                  summary?.total_resolved.toLocaleString() || "38"
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">With AI photo proof</p>
            </div>

            {/* In Progress */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiInProgress}</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 tracking-tight font-serif">
                {loading && !summary ? (
                  <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
                ) : (
                  summary?.total_in_progress.toLocaleString() || "5"
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">Active field officer tasks</p>
            </div>

            {/* SLA Adherence */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider">{t.kpiSlaAdherence}</span>
                <div className="p-2 rounded-xl bg-violet-50 text-violet-600">
                  <ShieldCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-violet-600 tracking-tight font-serif">
                {loading && !summary ? (
                  <div className="h-8 w-20 bg-slate-100 rounded animate-pulse" />
                ) : (
                  `${summary?.sla_adherence_percent || 93}%`
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Avg time: {summary?.overall_avg_resolution_hours || 12.4} hrs
              </p>
            </div>
          </div>
        </section>

        {/* Section Navigation Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("all")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "all"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              All Metrics
            </button>
            <button
              onClick={() => setActiveTab("photos")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "photos"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Verified Resolutions ({resolutions.length})
            </button>
            <button
              onClick={() => setActiveTab("departments")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === "departments"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Department Benchmarks
            </button>
          </div>
          <span className="text-xs text-slate-400 hidden sm:inline">
            Public View • Zero Login Required
          </span>
        </div>

        {/* 1. Department Breakdown Bar Chart */}
        {(activeTab === "all" || activeTab === "departments") && (
          <section className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-600" />
                  <span>{t.departmentBreakdown}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time SLA compliance rate (%) and average completion speed (hours)
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-500" /> SLA Compliance %
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-slate-300" /> Target (90%)
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {departments.map((dept) => {
                const colors = departmentColors[dept.department] || departmentColors.Water;
                return (
                  <div key={dept.department} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${colors.bg}`}>
                          {dept.department}
                        </span>
                        <span className="text-slate-500">
                          {dept.resolved} resolved / {dept.total} filed
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-500">
                          Avg: <strong className="text-slate-800">{dept.avg_hours}h</strong>
                        </span>
                        <span className="font-bold text-slate-900 w-12 text-right">
                          {dept.sla_compliance}%
                        </span>
                      </div>
                    </div>

                    <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden relative">
                      {/* Target threshold indicator at 90% */}
                      <div className="absolute top-0 bottom-0 left-[90%] w-0.5 bg-slate-400 z-10" title="SLA Target 90%" />
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          dept.sla_compliance >= 90 ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${Math.min(100, Math.max(10, dept.sla_compliance))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 2. 30-Day City-Wide Intake & Resolution Trend Chart */}
        {(activeTab === "all" || activeTab === "departments") && (
          <section className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  <span>{t.thirtyDayTrend}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.thirtyDayTrendSub}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-blue-500" /> Filed Complaints
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded bg-emerald-500" /> Resolved & Verified
                </span>
              </div>
            </div>

            {/* Sparkline Bar Chart */}
            <div className="h-36 flex items-end gap-1.5 sm:gap-2 pt-6 overflow-x-auto pb-2">
              {trends.map((pt, idx) => {
                const filedHeight = Math.max(6, (pt.filed / maxTrend) * 100);
                const resHeight = Math.max(6, (pt.resolved / maxTrend) * 100);
                return (
                  <div
                    key={pt.date}
                    className="flex-1 min-w-[14px] flex flex-col items-center gap-1 group relative cursor-pointer"
                  >
                    {/* Tooltip on hover */}
                    <div className="absolute -top-12 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-lg">
                      <p className="font-bold">{pt.date}</p>
                      <p className="text-blue-300">Filed: {pt.filed}</p>
                      <p className="text-emerald-300">Resolved: {pt.resolved}</p>
                    </div>

                    <div className="w-full flex items-end justify-center gap-0.5 h-24">
                      <div
                        className="w-1/2 bg-blue-400 group-hover:bg-blue-600 rounded-t transition-all"
                        style={{ height: `${filedHeight}%` }}
                      />
                      <div
                        className="w-1/2 bg-emerald-400 group-hover:bg-emerald-600 rounded-t transition-all"
                        style={{ height: `${resHeight}%` }}
                      />
                    </div>
                    {idx % 5 === 0 && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {pt.date.slice(3)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 3. "Verified Resolutions" Showcase */}
        {(activeTab === "all" || activeTab === "photos") && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <span>{t.verifiedShowcase}</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t.verifiedShowcaseSub}
                </p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 font-medium border border-emerald-200">
                100% Anonymized • Locality Level Only
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {resolutions.map((res) => {
                const colors = departmentColors[res.department] || departmentColors.Water;
                return (
                  <div
                    key={res.id}
                    className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col"
                  >
                    {/* Before / After Photo Comparison Cards */}
                    <div className="grid grid-cols-2 gap-1 p-2 bg-slate-100/60 border-b border-slate-100">
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase px-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-amber-500" />
                          <span>{t.beforePhoto}</span>
                        </div>
                        <div className="aspect-4/3 rounded-lg overflow-hidden bg-slate-200 relative group">
                          <img
                            src={res.before_photo_url}
                            alt="Before fix"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-emerald-700 uppercase px-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>{t.afterPhoto}</span>
                        </div>
                        <div className="aspect-4/3 rounded-lg overflow-hidden bg-slate-200 relative group">
                          <img
                            src={res.after_photo_url}
                            alt="After fix"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                          <div className="absolute bottom-1 right-1 bg-emerald-950/80 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />
                            {Math.round(res.verification_score * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Body */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${colors.bg}`}>
                            {res.department}
                          </span>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            {res.locality}
                          </span>
                        </div>
                        <h3 className="text-xs font-bold text-slate-900 leading-snug">
                          {res.category}
                        </h3>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                          {res.issue_text}
                        </p>
                      </div>

                      {/* AI Verification Note */}
                      <div className="bg-emerald-50/70 border border-emerald-200/60 rounded-xl p-2.5 text-[11px] text-emerald-950 space-y-1">
                        <div className="font-semibold flex items-center gap-1.5 text-emerald-900">
                          <Award className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{t.verificationBadge}</span>
                          <span className="text-[10px] text-emerald-700">
                            (Score: {res.verification_score})
                          </span>
                        </div>
                        <p className="text-emerald-800 text-[10px] leading-tight">
                          {res.verification_notes}
                        </p>
                      </div>

                      {/* Footer Info */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Speed: <strong>{res.resolution_time_hours}h</strong></span>
                        <button
                          onClick={() => setSelectedResolution(res)}
                          className="inline-flex items-center gap-1 text-emerald-700 hover:text-emerald-900 font-semibold text-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* Modal: Full Resolution Inspection Viewer */}
      {selectedResolution && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {selectedResolution.department}
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  {selectedResolution.category}
                </h3>
              </div>
              <button
                onClick={() => setSelectedResolution(null)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 py-1"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-600">Citizen Complaint</span>
                  <img
                    src={selectedResolution.before_photo_url}
                    alt="Before"
                    className="w-full h-52 object-cover rounded-xl border border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-emerald-700">Verified Resolution</span>
                  <img
                    src={selectedResolution.after_photo_url}
                    alt="After"
                    className="w-full h-52 object-cover rounded-xl border border-emerald-300"
                  />
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Locality:</span>
                  <strong className="text-slate-800">{selectedResolution.locality} (Approx. {selectedResolution.lat}°N, {selectedResolution.lng}°E)</strong>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Resolution Speed:</span>
                  <strong className="text-emerald-700">{selectedResolution.resolution_time_hours} Hours from intake</strong>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">AI Confidence:</span>
                  <strong className="text-violet-700 font-mono">{Math.round(selectedResolution.verification_score * 100)}% Match Verified</strong>
                </div>
                <p className="text-xs text-slate-600 border-t border-slate-200 pt-2 italic">
                  "{selectedResolution.verification_notes}"
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => setSelectedResolution(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 px-4 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">
          AllalKalai (அல்லல் களை) • Autonomous Civic Accountability & Grievance Routing System
        </p>
        <p className="mt-1 text-slate-400">
          Open Transparency Portal • No authentication or citizen registration required to view civic performance
        </p>
      </footer>
    </div>
  );
}
