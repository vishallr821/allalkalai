import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../hooks";
import { useLanguage } from "../lib/i18n";
import { LanguageToggle } from "../components/ui/LanguageToggle";
import {
  Card,
  Input,
  Select,
  Button,
} from "../components/ui";
import { ArrowLeft, Award } from "lucide-react";
import { API_BASE_URL } from "../config";

const DEPARTMENTS = [
  "Water",
  "Electricity",
  "Sanitation",
  "Roads",
  "Health",
  "Revenue",
  "Police",
];

type UserRole = "citizen" | "official" | "dept_head" | "officer";

export default function Login() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRole>("citizen");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  usePageTitle(isSignUp ? "Sign Up" : "Sign In");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      if (isSignUp) {
        if (role === "dept_head" && !department) {
          throw new Error("Please select a department");
        }
        if (role === "officer" && !department) {
          throw new Error("Please select a department");
        }

        let registeredViaApi = false;
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, name, role, department }),
          });

          if (res.ok) {
            registeredViaApi = true;
          } else {
            const errJson = await res.json().catch(() => ({}));
            if (errJson.error) throw new Error(errJson.error);
          }
        } catch (apiErr: any) {
          // If network failed, fall back to direct Supabase signup below
          if (apiErr.message && !apiErr.message.includes("Failed to fetch") && !apiErr.message.includes("NetworkError")) {
            throw apiErr;
          }
        }

        if (!registeredViaApi) {
          const { data, error: signUpError } = await supabase.auth.signUp({
            email,
            password,
          });

          if (signUpError) {
            if (signUpError.message?.toLowerCase().includes("rate limit")) {
              throw new Error("Supabase email rate limit exceeded. Please ensure your backend server is running on port 4000.");
            }
            throw signUpError;
          }
          if (!data.user) throw new Error("Failed to create user");

          const { error: profileError } = await supabase
            .from("profiles")
            .insert({
              id: data.user.id,
              name,
              role,
              department: role === "dept_head" || role === "officer" ? department : null,
            });

          if (profileError) throw profileError;
        }

        // Auto-login immediately after creation
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (!loginError) {
          if (role === "citizen") navigate("/citizen/tickets");
          else if (role === "dept_head") navigate("/depthead/dashboard");
          else if (role === "officer") navigate("/officer/dashboard");
          else if (role === "official") navigate("/official/issue-order");
          else navigate("/citizen/tickets");
          return;
        }

        setEmail("");
        setPassword("");
        setName("");
        setRole("citizen");
        setDepartment("");
        setIsSignUp(false);
        setError("");
        setSuccess("Account created successfully! Please sign in with your credentials.");
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (loginError) throw loginError;

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Failed to get user");

        const { data: profileData, error: fetchError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (fetchError) throw fetchError;

        const userRole = profileData?.role;
        if (userRole === "citizen") {
          navigate("/citizen/tickets");
        } else if (userRole === "dept_head") {
          navigate("/depthead/dashboard");
        } else if (userRole === "officer") {
          navigate("/officer/dashboard");
        } else if (userRole === "official") {
          navigate("/official/issue-order");
        } else {
          navigate("/citizen/tickets");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 flex flex-col items-center justify-center min-h-screen px-4 py-8 relative">
      {/* Top Navbar */}
      <div className="w-full max-w-md flex items-center justify-between mb-4 text-xs">
        <Link
          to="/public"
          className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white font-medium transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t.publicDashboard}</span>
        </Link>
        <LanguageToggle />
      </div>

      <Card className="w-full max-w-md bg-white/95 backdrop-blur-md shadow-2xl border-slate-200">
        <div className="space-y-6">
          {/* Header Branding */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-white shadow-lg mx-auto font-bold text-xl">
              அ
            </div>
            <h1 className="text-2xl font-bold text-slate-950 font-serif tracking-tight">
              {t.appName}
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              {t.appSubtitle}
            </p>
          </div>

          {/* Thirukkural 555 Badge */}
          <div className="bg-amber-50/80 border border-amber-200/80 rounded-xl p-3 text-center space-y-1">
            <div className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 uppercase tracking-wider">
              <Award className="w-3.5 h-3.5" />
              <span>திருக்குறள் 555</span>
            </div>
            <p className="font-serif text-xs font-semibold text-amber-950 whitespace-pre-line leading-relaxed">
              {t.thirukkuralTamil}
            </p>
            <p className="text-[11px] text-amber-800/90 italic leading-snug">
              "{t.thirukkuralEnglish}"
            </p>
          </div>

          {/* Messages */}
          {error && (
            <p className="text-red-700 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {success && (
            <p className="text-emerald-700 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ✓ {success}
            </p>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignUp && (
              <>
                <Input
                  label="Full Name"
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Sundararajan"
                />

                <Select
                  label="Role"
                  id="role"
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value as UserRole);
                    setDepartment("");
                  }}
                >
                  <option value="citizen">Citizen (குடிமகன்)</option>
                  <option value="official">Official (முதன்மை அலுவலர்)</option>
                  <option value="dept_head">Department Head (துறைத் தலைவர்)</option>
                  <option value="officer">Officer (கள அலுவலர்)</option>
                </Select>

                {(role === "dept_head" || role === "officer") && (
                  <Select
                    label="Department"
                    id="department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                  >
                    <option value="">Select a department</option>
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </Select>
                )}
              </>
            )}

            <Input
              label="Email"
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="official@allalkalai.gov.in"
            />

            <Input
              label="Password"
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />

            <Button
              variant="primary"
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {loading
                ? "Signing in..."
                : isSignUp
                  ? "Create Account"
                  : "Sign In to Portal"}
            </Button>
          </form>

          {/* Toggle Sign Up / Sign In */}
          <div className="border-t border-slate-200 pt-3 text-center space-y-2">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
                setSuccess("");
              }}
              className="text-xs text-slate-600 hover:text-emerald-700 font-semibold transition-colors"
            >
              {isSignUp
                ? "Already have an account? Sign in"
                : "Don't have an account? Register as Citizen"}
            </button>

            <div>
              <Link
                to="/public"
                className="text-xs text-emerald-700 hover:text-emerald-900 font-medium inline-flex items-center gap-1"
              >
                <span>Browse Public Transparency Dashboard</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
