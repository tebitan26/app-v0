"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";
import { useSessionProfile } from "../lib/useSessionProfile";

type EventRow = {
  id: string;
  title: string;
  start_at: string | null;
};

type ScanLogRow = {
  created_at: string | null;
  ticket_id: string | null;
  event_id: string | null;
  user_id: string | null;
  result: string | null;
  reason: string | null;
};

type OverrideLogRow = {
  created_at: string | null;
  ticket_id: string | null;
  event_id: string | null;
  user_id: string | null;
  justification: string | null;
};

type TabKey = "scans" | "overrides";

function truncateId(value: string | null) {
  if (!value) return "—";
  return value.length > 10 ? `${value.slice(0, 8)}…` : value;
}

export default function OrgLogsPage() {
  const { loading, role } = useSessionProfile();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [tab, setTab] = useState<TabKey>("scans");
  const [scanLogs, setScanLogs] = useState<ScanLogRow[]>([]);
  const [overrideLogs, setOverrideLogs] = useState<OverrideLogRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = role === "ORGANIZER" || role === "ADMIN";

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  useEffect(() => {
    if (!allowed) return;

    async function loadEvents() {
      setLoadingEvents(true);
      setError(null);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setEvents([]);
        setSelectedEventId("");
        setError("Non authentifié");
        setLoadingEvents(false);
        return;
      }

      const { data, error: eventError } = await supabase
        .from("events")
        .select("id,title,start_at")
        .eq("organizer_id", user.id)
        .order("start_at", { ascending: false });

      if (eventError) {
        setError(eventError.message);
        setEvents([]);
        setSelectedEventId("");
        setLoadingEvents(false);
        return;
      }

      const rows = (data ?? []) as EventRow[];
      setEvents(rows);
      setSelectedEventId(rows[0]?.id ?? "");
      setLoadingEvents(false);
    }

    loadEvents();
  }, [allowed]);

  useEffect(() => {
    if (!allowed || !selectedEventId) return;

    async function loadLogs() {
      setLoadingLogs(true);
      setError(null);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Non authentifié");
        setLoadingLogs(false);
        return;
      }

      const res = await fetch(
        `/api/org/logs/${tab}?event_id=${encodeURIComponent(selectedEventId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload?.error || "Erreur de chargement.");
        setLoadingLogs(false);
        return;
      }

      if (tab === "scans") {
        setScanLogs((payload?.data ?? []) as ScanLogRow[]);
      } else {
        setOverrideLogs((payload?.data ?? []) as OverrideLogRow[]);
      }
      setLoadingLogs(false);
    }

    loadLogs();
  }, [allowed, selectedEventId, tab]);

  if (loading) return <p className="text-white/70">Chargement…</p>;

  if (!allowed) {
    return (
      <section>
        <h1 className="text-3xl font-bold">Logs & Exports</h1>
        <p className="mt-4 text-white/80">Accès réservé aux organisateurs.</p>
        <Link
          href="/login"
          className="mt-6 inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
        >
          Se connecter
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Logs & Exports</h1>
          <p className="mt-2 text-white/70">
            Consulte les scans et overrides, puis exporte en CSV.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!selectedEventId) return;
              window.location.href = `/api/org/logs/export?type=scans&event_id=${encodeURIComponent(
                selectedEventId
              )}`;
            }}
            className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
            disabled={!selectedEventId}
          >
            Exporter scans CSV
          </button>
          <button
            type="button"
            onClick={() => {
              if (!selectedEventId) return;
              window.location.href = `/api/org/logs/export?type=overrides&event_id=${encodeURIComponent(
                selectedEventId
              )}`;
            }}
            className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
            disabled={!selectedEventId}
          >
            Exporter overrides CSV
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-white/60">
              Événement
            </p>
            <select
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-[#7A3CFF]"
            >
              {loadingEvents ? (
                <option value="">Chargement…</option>
              ) : events.length === 0 ? (
                <option value="">Aucun événement</option>
              ) : (
                events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                    {event.start_at
                      ? ` · ${new Date(event.start_at).toLocaleDateString()}`
                      : ""}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["scans", "overrides"] as TabKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`rounded-xl px-4 py-2 text-sm font-medium ${
                  tab === key
                    ? "bg-[#7A3CFF] text-white"
                    : "border border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
                }`}
              >
                {key === "scans" ? "Scans" : "Overrides"}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          {loadingLogs ? (
            <p className="text-white/60">Chargement…</p>
          ) : tab === "scans" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-white/60">
                  <tr>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Ticket</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Result</th>
                    <th className="py-2 pr-4">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {scanLogs.length === 0 ? (
                    <tr>
                      <td className="py-3 text-white/60" colSpan={5}>
                        Aucun log pour l’instant.
                      </td>
                    </tr>
                  ) : (
                    scanLogs.map((row, index) => (
                      <tr key={`${row.ticket_id ?? "row"}-${index}`}>
                        <td className="py-2 pr-4 text-white/80">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-white/80">
                          {truncateId(row.ticket_id)}
                        </td>
                        <td className="py-2 pr-4 text-white/80">
                          {truncateId(row.user_id)}
                        </td>
                        <td className="py-2 pr-4 text-white/80">
                          {row.result ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-white/80">
                          {row.reason ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-white/60">
                  <tr>
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Ticket</th>
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Justification</th>
                  </tr>
                </thead>
                <tbody>
                  {overrideLogs.length === 0 ? (
                    <tr>
                      <td className="py-3 text-white/60" colSpan={4}>
                        Aucun override pour l’instant.
                      </td>
                    </tr>
                  ) : (
                    overrideLogs.map((row, index) => (
                      <tr key={`${row.ticket_id ?? "row"}-${index}`}>
                        <td className="py-2 pr-4 text-white/80">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="py-2 pr-4 text-white/80">
                          {truncateId(row.ticket_id)}
                        </td>
                        <td className="py-2 pr-4 text-white/80">
                          {truncateId(row.user_id)}
                        </td>
                        <td className="py-2 pr-4 text-white/80">
                          {row.justification ?? "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedEvent ? (
        <p className="text-xs text-white/40">
          Événement sélectionné : {selectedEvent.title}
        </p>
      ) : null}
    </section>
  );
}
