"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSessionProfile } from "../lib/useSessionProfile";

type ValidationState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      data: {
        ticket_id: string;
        used_at: string | null;
        event: {
          title: string | null;
          start_at: string | null;
          city: string | null;
        };
        batch: {
          name: string | null;
        };
      };
    }
  | {
      status: "error";
      message: string;
      code?: string;
      unlock_at?: string | null;
    };

export default function StaffClient() {
  const { loading, role } = useSessionProfile();
  const searchParams = useSearchParams();
  const initialToken = useMemo(
    () => searchParams.get("token") ?? "",
    [searchParams]
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState(initialToken);
  const [state, setState] = useState<ValidationState>({ status: "idle" });
  const isLoading = state.status === "loading";

  function focusInput() {
    inputRef.current?.focus();
  }

  function beep(type: "success" | "error") {
    try {
      if (typeof window === "undefined") return;
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const duration = type === "success" ? 0.08 : 0.14;
      osc.type = "sine";
      osc.frequency.value = type === "success" ? 880 : 220;
      gain.gain.value = 0.12;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
      osc.onended = () => ctx.close();
    } catch {
      return;
    }
  }

  async function validateToken(nextToken: string) {
    if (isLoading) return;
    const trimmed = nextToken.trim();
    if (!trimmed) {
      setState({
        status: "error",
        message: "Ajoute un token pour valider.",
        code: "missing_token",
      });
      return;
    }

    setState({ status: "loading" });

    try {
      const res = await fetch("/api/tickets/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: trimmed }),
      });

      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = payload?.error || "Impossible de valider le ticket.";
        setState({
          status: "error",
          message,
          code: payload?.error,
          unlock_at: payload?.unlock_at ?? null,
        });
        return;
      }

      setState({
        status: "success",
        data: {
          ticket_id: payload.ticket_id ?? payload.ticketId ?? "",
          used_at: payload.used_at ?? null,
          event: {
            title: payload.event?.title ?? null,
            start_at: payload.event?.start_at ?? null,
            city: payload.event?.city ?? null,
          },
          batch: {
            name: payload.batch?.name ?? null,
          },
        },
      });
    } catch {
      setState({
        status: "error",
        message: "Erreur réseau. Réessaie.",
        code: "network_error",
      });
    }
  }

  useEffect(() => {
    if (initialToken) validateToken(initialToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialToken]);

  function reset() {
    setToken("");
    setState({ status: "idle" });
    focusInput();
  }

  useEffect(() => {
    focusInput();
  }, []);

  useEffect(() => {
    if (state.status === "success") {
      beep("success");
      if (navigator?.vibrate) navigator.vibrate(80);
      focusInput();
    }
    if (state.status === "error") {
      beep("error");
      if (navigator?.vibrate) navigator.vibrate([40, 40, 40]);
      focusInput();
    }
  }, [state.status]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        reset();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        focusInput();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    if (!pasted) return;
    event.preventDefault();
    setToken(pasted);
    validateToken(pasted);
  }

  if (loading) return <p className="text-white/70">Chargement…</p>;

  // ✅ Autoriser STAFF + ORGANIZER + ADMIN à utiliser le scanner
  if (role !== "STAFF" && role !== "ORGANIZER" && role !== "ADMIN") {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Accès refusé</h1>
        <p className="text-white/70">
          Vous n’avez pas les permissions pour accéder à ce scanner.
        </p>
        <Link
          href="/"
          className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
        >
          Retour à l’accueil
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-3xl font-bold">Scanner staff</h1>
        <p className="mt-2 text-white/70">
          Valide les billets en scannant ou en collant un token.
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium uppercase tracking-wide text-white/60">
            Contrôle d'accès
          </p>
          {state.status !== "idle" ? (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                state.status === "loading"
                  ? "border border-white/10 bg-white/10 text-white/80"
                  : state.status === "success"
                  ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                  : "border border-red-500/30 bg-red-500/10 text-red-200"
              }`}
            >
              {state.status.toUpperCase()}
            </span>
          ) : null}
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-sm text-white/70">Token</label>
            <input
              ref={inputRef}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onPaste={handlePaste}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  validateToken(token);
                }
              }}
              disabled={isLoading}
              placeholder="Colle le token du billet…"
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/40 focus:border-[#7A3CFF] disabled:opacity-60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => validateToken(token)}
              disabled={isLoading}
              className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90 disabled:opacity-60"
            >
              {isLoading ? "Validation…" : "Valider"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex rounded-xl border border-white/15 bg-white/5 px-5 py-3 font-medium hover:bg-white/10"
            >
              Effacer
            </button>
          </div>

          {state.status === "error" ? (
            state.code === "ticket_locked" ? (
              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">
                <p className="text-base font-semibold">⏳ Ticket verrouillé</p>
                <p className="mt-1 text-sm text-amber-100/80">
                  Déverrouillage à{" "}
                  {state.unlock_at
                    ? new Date(state.unlock_at).toLocaleString()
                    : "—"}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
                {state.message}
              </div>
            )
          ) : null}

          {state.status === "success" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-4">
                <p className="text-lg font-semibold">✅ Entrée autorisée</p>
                <p className="mt-1 text-sm text-emerald-100/80">
                  Ticket valide pour cet événement.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white/60">Ticket ID</p>
                  <p className="text-base font-medium">
                    {state.data.ticket_id || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white/60">Événement</p>
                  <p className="text-base font-medium">
                    {state.data.event.title || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white/60">Début</p>
                  <p className="text-base font-medium">
                    {state.data.event.start_at
                      ? new Date(state.data.event.start_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white/60">Ville</p>
                  <p className="text-base font-medium">
                    {state.data.event.city || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white/60">Lot</p>
                  <p className="text-base font-medium">
                    {state.data.batch.name || "—"}
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <p className="text-sm text-white/60">Utilisé à</p>
                  <p className="text-base font-medium">
                    {state.data.used_at
                      ? new Date(state.data.used_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {state.status === "success" || state.status === "error" ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90"
            >
              Scanner suivant
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
