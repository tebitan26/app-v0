"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabaseClient";

type ValidateResponse =
  | {
      ok: true;
      status: "VALID" | "ALREADY_USED" | "INVALID" | "NOT_FOUND";
      message?: string;
      ticket_id?: string;
      event_id?: string;
      used_at?: string | null;
    }
  | {
      ok: false;
      error: string;
    };

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function StaffScannerPage() {
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ValidateResponse | null>(null);

  const [cameraSupported, setCameraSupported] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastSeenRef = useRef<{ value: string; at: number } | null>(null);

  const canScan = useMemo(() => {
    // V0: allow ORGANIZER to validate too (so you can test now)
    return role === "STAFF" || role === "ORGANIZER";
  }, [role]);

  useEffect(() => {
    const supported = typeof window !== "undefined" && "BarcodeDetector" in window;
    setCameraSupported(Boolean(supported));
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      setAuthLoading(true);
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      if (!mounted) return;

      if (!user) {
        setEmail(null);
        setRole(null);
        setAuthLoading(false);
        return;
      }

      setEmail(user.email ?? null);

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!mounted) return;

      if (error) setRole(null);
      else setRole((prof as any)?.role ?? null);

      setAuthLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function validate(scannedToken: string) {
    const t = (scannedToken || "").trim();
    if (!t) return;

    setBusy(true);
    setResult(null);

    try {
      const res = await fetch("/api/tickets/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: t }),
      });

      const json = (await res.json()) as ValidateResponse;
      setResult(json);
      setToken(t);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? "Erreur réseau" });
    } finally {
      setBusy(false);
    }
  }

  async function startCamera() {
    setCameraError(null);

    if (!videoRef.current) {
      setCameraError("Élément vidéo introuvable.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraOn(true);

      // @ts-expect-error available at runtime when supported
      const detector = new BarcodeDetector({ formats: ["qr_code"] });

      const loop = async () => {
        if (!videoRef.current) return;

        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes?.length) {
            const value = (barcodes[0] as any)?.rawValue as string;
            if (value) {
              const now = Date.now();
              const last = lastSeenRef.current;

              // Avoid repeating the same QR every frame
              if (!last || last.value !== value || now - last.at > 2000) {
                lastSeenRef.current = { value, at: now };
                await validate(value);
              }
            }
          }
        } catch {
          // ignore frame errors
        }

        rafRef.current = window.requestAnimationFrame(loop);
      };

      rafRef.current = window.requestAnimationFrame(loop);
    } catch (e: any) {
      setCameraError(e?.message ?? "Impossible d'accéder à la caméra.");
      setCameraOn(false);
    }
  }

  function stopCamera() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraOn(false);
  }

  useEffect(() => {
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badge = useMemo(() => {
    if (!result) return null;

    if (!result.ok) {
      return { label: "ERREUR", cls: "bg-red-500/15 border-red-500/30 text-red-200" };
    }

    if (result.status === "VALID") {
      return { label: "OK", cls: "bg-emerald-500/15 border-emerald-500/30 text-emerald-200" };
    }

    if (result.status === "ALREADY_USED") {
      return { label: "DÉJÀ UTILISÉ", cls: "bg-amber-500/15 border-amber-500/30 text-amber-200" };
    }

    return { label: "INVALIDE", cls: "bg-red-500/15 border-red-500/30 text-red-200" };
  }, [result]);

  return (
    <section className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Scanner staff</h1>
          <p className="mt-2 text-white/70">Scanne un QR Sidetick ou colle un token pour valider un billet.</p>
          <p className="mt-1 text-xs text-white/50">V0: validation serveur + anti double-scan (used_at).</p>
        </div>

        <Link
          href="/"
          className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          Accueil
        </Link>
      </div>

      {authLoading ? (
        <p className="text-white/60">Vérification session…</p>
      ) : !email ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-white/80">Tu dois être connecté.</p>
          <Link href="/login" className="mt-3 inline-flex rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90">
            Se connecter
          </Link>
        </div>
      ) : !canScan ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
          <p className="text-red-200 font-medium">Accès refusé</p>
          <p className="mt-2 text-red-200/80">
            Ton rôle est <span className="font-semibold">{role ?? "inconnu"}</span>. Il faut <span className="font-semibold">STAFF</span> (ou ORGANIZER en V0).
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-white/70">
                Connecté: <span className="text-white/90">{email}</span> · rôle: {role}
              </div>

              {badge ? (
                <div className={cx("rounded-full border px-3 py-1 text-xs font-semibold", badge.cls)}>{badge.label}</div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold">Saisie manuelle</p>
                <p className="mt-1 text-xs text-white/60">Colle le token (QR) ou un code.</p>

                <div className="mt-3 flex gap-2">
                  <input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="token QR…"
                    className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/30"
                  />
                  <button
                    onClick={() => validate(token)}
                    disabled={busy || !token.trim()}
                    className="rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    Valider
                  </button>
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      setToken("");
                      setResult(null);
                    }}
                    className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-semibold">Caméra</p>
                <p className="mt-1 text-xs text-white/60">Nécessite un navigateur supportant BarcodeDetector.</p>

                {!cameraSupported ? (
                  <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Scan caméra non supporté ici. Utilise la saisie manuelle.
                  </div>
                ) : (
                  <>
                    <div className="mt-3 flex gap-2">
                      {!cameraOn ? (
                        <button onClick={startCamera} className="rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90">
                          Démarrer caméra
                        </button>
                      ) : (
                        <button onClick={stopCamera} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/80 hover:bg-white/10">
                          Stop
                        </button>
                      )}
                    </div>

                    {cameraError ? (
                      <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200">{cameraError}</div>
                    ) : null}

                    <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      <video ref={videoRef} className="h-[260px] w-full object-cover" playsInline muted />
                    </div>

                    <p className="mt-2 text-xs text-white/50">Astuce: on bloque les doublons (même QR) pendant 2s.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {result ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-sm font-semibold">Résultat</p>

              {!result.ok ? (
                <p className="mt-2 text-sm text-red-200">{result.error}</p>
              ) : (
                <div className="mt-2 space-y-1 text-sm text-white/80">
                  <p>
                    Statut: <span className="font-semibold">{result.status}</span>
                  </p>
                  {result.message ? <p>{result.message}</p> : null}
                  {result.ticket_id ? <p className="text-xs text-white/60">Ticket: {result.ticket_id}</p> : null}
                  {result.used_at ? <p className="text-xs text-white/60">Used at: {result.used_at}</p> : null}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}