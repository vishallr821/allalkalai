import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Ticket } from "../lib/supabase";
import { supabase } from "../lib/supabase";
import { usePageTitle } from "../hooks";
import {
  EmptyState,
  LoadingState,
  Button,
} from "../components/ui";
import DepartmentBadge from "../components/ui/DepartmentBadge";
import { formatRelativeTime } from "../lib/utils";
import TopNav from "../components/TopNav";
import { useLanguage } from "../lib/i18n";

interface TicketWithDepartments extends Ticket {
  issues?: Array<{ department: string }>;
}

export default function CitizenTickets() {
  usePageTitle("My Complaints");
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [tickets, setTickets] = useState<TicketWithDepartments[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTickets = async () => {
      try {
        setError("");
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          navigate("/login");
          return;
        }

        const { data, error: fetchError } = await supabase
          .from("tickets")
          .select("*, issues(department)")
          .eq("citizen_id", user.id)
          .order("created_at", { ascending: false });

        if (fetchError) throw fetchError;
        setTickets(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [navigate]);

  const getUniqueDepartments = (
    ticket: TicketWithDepartments
  ): string[] => {
    if (!ticket.issues) return [];
    return Array.from(new Set(ticket.issues.map((i) => i.department)));
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      <TopNav />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 font-serif">
              {t.myTickets}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">
              Track your filed civic issues and verify resolutions
            </p>
          </div>
          <Link to="/citizen/submit">
            <Button variant="primary" className="text-xs bg-emerald-600 hover:bg-emerald-700">
              + {t.submitComplaint}
            </Button>
          </Link>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {loading && <LoadingState message="Loading your complaints..." />}

        {!loading && tickets.length === 0 && (
          <EmptyState
            message="You haven't filed any complaints yet."
            actionLabel="File a complaint"
            onAction={() => navigate("/citizen/submit")}
          />
        )}

        {!loading && tickets.length > 0 && (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/citizen/track/${ticket.id}`}
                className="block bg-white border border-slate-300 rounded-lg p-5 hover:shadow-lg transition-all duration-150"
              >
                <p className="text-base text-slate-800 line-clamp-2">
                  {ticket.raw_text.length > 90
                    ? ticket.raw_text.substring(0, 90) + "..."
                    : ticket.raw_text}
                </p>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-sm text-slate-500">
                    {formatRelativeTime(ticket.created_at)}
                  </p>
                  <div className="flex gap-2 flex-wrap justify-end">
                    {getUniqueDepartments(ticket).map((dept) => (
                      <DepartmentBadge
                        key={dept}
                        department={dept as any}
                      />
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
