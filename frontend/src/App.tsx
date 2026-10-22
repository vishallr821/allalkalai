import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import React, { useEffect, useState, Suspense, lazy } from "react";
import { supabase } from "./lib/supabase";

// Lazy-loaded routes for code-splitting & lightning-fast initial load
const PublicDashboard = lazy(() => import("./pages/PublicDashboard"));
const Login = lazy(() => import("./pages/Login"));
const CitizenSubmit = lazy(() => import("./pages/CitizenSubmit"));
const CitizenTickets = lazy(() => import("./pages/CitizenTickets"));
const CitizenTrack = lazy(() => import("./pages/CitizenTrack"));
const DepthDashboard = lazy(() => import("./pages/DepthDashboard"));
const OfficerDashboard = lazy(() => import("./pages/OfficerDashboard"));
const OfficerTicket = lazy(() => import("./pages/OfficerTicket"));
const OfficialIssueOrder = lazy(() => import("./pages/OfficialIssueOrder"));
const OfficialTickets = lazy(() => import("./pages/OfficialTickets"));
const OfficialTrack = lazy(() => import("./pages/OfficialTrack"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Skeleton loader component during lazy chunk loading
function PageSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 animate-pulse flex items-center justify-center">
        <span className="text-emerald-700 font-bold text-xl">அ</span>
      </div>
      <div className="h-4 w-32 bg-slate-200 rounded animate-pulse" />
      <div className="h-3 w-48 bg-slate-100 rounded animate-pulse" />
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setIsAuthenticated(!!session);
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => subscription?.unsubscribe();
  }, []);

  if (isAuthenticated === null) {
    return <PageSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageSkeleton />}>
        <Routes>
          {/* Public Transparency Dashboard (Zero authentication required) */}
          <Route path="/public" element={<PublicDashboard />} />

          {/* Authentication */}
          <Route path="/login" element={<Login />} />

          {/* Citizen Routes */}
          <Route
            path="/citizen/submit"
            element={
              <ProtectedRoute>
                <CitizenSubmit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/citizen/tickets"
            element={
              <ProtectedRoute>
                <CitizenTickets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/citizen/track/:ticketId"
            element={
              <ProtectedRoute>
                <CitizenTrack />
              </ProtectedRoute>
            }
          />

          {/* Department Head Routes */}
          <Route
            path="/depthead/dashboard"
            element={
              <ProtectedRoute>
                <DepthDashboard />
              </ProtectedRoute>
            }
          />

          {/* Field Officer Routes */}
          <Route
            path="/officer/dashboard"
            element={
              <ProtectedRoute>
                <OfficerDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/officer/ticket/:issueId"
            element={
              <ProtectedRoute>
                <OfficerTicket />
              </ProtectedRoute>
            }
          />

          {/* Official Apex Routes */}
          <Route
            path="/official/issue-order"
            element={
              <ProtectedRoute>
                <OfficialIssueOrder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/official/tickets"
            element={
              <ProtectedRoute>
                <OfficialTickets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/official/track/:ticketId"
            element={
              <ProtectedRoute>
                <OfficialTrack />
              </ProtectedRoute>
            }
          />

          {/* Default Route redirects to Public Dashboard */}
          <Route path="/" element={<Navigate to="/public" replace />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
