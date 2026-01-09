"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/app/lib/supabaseClient";
import { useSessionProfile } from "@/app/lib/useSessionProfile";

type StaffRow = {
  organizer_id: string;
  staff_user_id: string;
  staff_email: string | null;
  staff_display_name: string | null;
  staff_role: string | null;
  created_at: string | null;
};

type Banner = { type: "success" | "error"; message: string } | null;

function humanizeStaffError(code?: string, fallback?: string) {
  switch (code) {
    case "invalid_email":
      return "Email invalide. Exemple : prenom@domaine.com";
    case "user_not_found":
      return "Aucun compte trouvé pour cet email. La personne doit d’abord se connecter une fois à Sidetick.";
    case "not_staff_role":
      return "Ce compte existe, mais n’a pas le rôle STAFF. Passe son profil en STAFF dans Supabase (profiles).";
    case "already_added":
      return "Ce membre fait déjà partie de ton staff.";
    case "already_assigned":
      return "Ce membre est déjà rattaché à un autre organisateur.";
    case "not_authorized":
      return "Accès refusé. Seuls les organisateurs peuvent gérer le staff.";
    case "not_authenticated":
      return "Tu n’es pas connecté. Reconnecte-toi.";
    default:
      return fallback || "Impossible de réaliser l’action. Réessaie.";
  }
}

export default function OrgStaffPage() {
  const { loading: profileLoading, role } = useSessionProfile();
  const roleUpper = (role ?? "").toUpperCase();
  const allowed = roleUpper === "ORGANIZER" || roleUpper === "ADMIN";

  const [email, setEmail] = useState("");
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  const hasStaff = staff.length > 0;

  const canSubmit = useMemo(() => email.trim().includes("@"), [email]);

  const sortedStaff = useMemo(
    () =>
      [...staff].sort((a, b) => {
        const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTime - aTime;
      }),
    [staff]
  );

  async function getUserId() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  }

  async function getAccessToken() {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function loadStaff() {
    setLoading(true);
    setBanner(null);

    if (!allowed) {
      setStaff([]);
      setLoading(false);
      return;
    }

    const userId = await getUserId();
    if (!userId) {
      setBanner({
        type: "error",
        message: humanizeStaffError("not_authenticated"),
      });
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("organizer_staff_view")
        .select(
          "organizer_id,staff_user_id,staff_email,staff_display_name,staff_role,created_at"
        )
        .eq("organizer_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("staff_list_failed", error);
        setBanner({
          type: "error",
          message:
            error.message ||
            humanizeStaffError(undefined, "Impossible de charger le staff."),
        });
        setStaff([]);
        setLoading(false);
        return;
      }

      setStaff((data ?? []) as StaffRow[]);
      setLoading(false);
    } catch (error) {
      console.error("staff_list_failed", error);
      setBanner({ type: "error", message: "Erreur réseau." });
      setLoading(false);
    }
  }

  async function handleAdd() {
    const trimmed = email.trim();
    if (!trimmed) {
      setBanner({ type: "error", message: "Ajoute un email valide." });
      return;
    }

    setSubmitting(true);
    setBanner(null);

    const userId = await getUserId();
    if (!userId) {
      setBanner({
        type: "error",
        message: humanizeStaffError("not_authenticated"),
      });
      setSubmitting(false);
      return;
    }

    try {
      const { data: staffProfiles, error: lookupError } = await supabase
        .from("profiles")
        .select("id, role")
        .ilike("email", trimmed)
        .limit(1);

      if (lookupError) {
        console.error("staff_add_lookup_failed", lookupError);
        setBanner({
          type: "error",
          message:
            lookupError.message ||
            humanizeStaffError(undefined, "Impossible d’ajouter ce membre."),
        });
        setSubmitting(false);
        return;
      }

      const staffProfile = staffProfiles?.[0];
      if (!staffProfile?.id) {
        setBanner({
          type: "error",
          message: humanizeStaffError("user_not_found"),
        });
        setSubmitting(false);
        return;
      }

      const staffRole = (staffProfile.role ?? "").toString().toUpperCase();
      if (staffRole !== "STAFF" && staffRole !== "ADMIN") {
        setBanner({
          type: "error",
          message: humanizeStaffError("not_staff_role"),
        });
        setSubmitting(false);
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setBanner({
          type: "error",
          message: humanizeStaffError("not_authenticated"),
        });
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/org/staff/add", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ email: trimmed }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409 && payload?.error === "already_assigned") {
          setBanner({
            type: "error",
            message: humanizeStaffError("already_assigned"),
          });
        } else {
          setBanner({
            type: "error",
            message: humanizeStaffError(
              payload?.code,
              payload?.error || "Impossible d’ajouter ce membre."
            ),
          });
        }
        setSubmitting(false);
        return;
      }

      setEmail("");
      setBanner({ type: "success", message: "Membre ajouté avec succès." });
      await loadStaff();
      setSubmitting(false);
    } catch (error) {
      console.error("staff_add_failed", error);
      setBanner({ type: "error", message: "Erreur réseau." });
      setSubmitting(false);
    }
  }

  async function handleRemove(staffUserId: string) {
    setRemovingId(staffUserId);
    setBanner(null);

    const userId = await getUserId();
    if (!userId) {
      setBanner({
        type: "error",
        message: humanizeStaffError("not_authenticated"),
      });
      setRemovingId(null);
      return;
    }

    try {
      const { data: deletedRows, error: deleteError } = await supabase
        .from("organizer_staff")
        .delete()
        .eq("organizer_id", userId)
        .eq("staff_user_id", staffUserId)
        .select("staff_user_id");

      if (deleteError) {
        console.error("staff_remove_failed", deleteError);
        setBanner({
          type: "error",
          message:
            deleteError.message ||
            humanizeStaffError(undefined, "Impossible de retirer ce membre."),
        });
        setRemovingId(null);
        return;
      }

      if (!deletedRows || deletedRows.length === 0) {
        setBanner({
          type: "error",
          message: humanizeStaffError("not_found", "Membre introuvable."),
        });
        setRemovingId(null);
        return;
      }

      setBanner({ type: "success", message: "Membre retiré." });
      setStaff((prev) => prev.filter((row) => row.staff_user_id !== staffUserId));
      setRemovingId(null);
    } catch (error) {
      console.error("staff_remove_failed", error);
      setBanner({ type: "error", message: "Erreur réseau." });
      setRemovingId(null);
    }
  }

  useEffect(() => {
    if (profileLoading) return;
    loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, allowed]);

  useEffect(() => {
    if (banner?.type !== "success") return;
    const timer = window.setTimeout(() => {
      setBanner(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  if (profileLoading) {
    return <p className="text-white/70">Chargement…</p>;
  }

  if (!allowed) {
    return (
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Gestion staff</h1>
        <p className="text-white/80">Accès réservé aux organisateurs.</p>
        <Link
          href="/org"
          className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 hover:bg-white/10"
        >
          ← Retour organizer
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Gestion staff</h1>
            <p className="mt-2 text-white/70">
              Ajoute des membres pour scanner les billets au nom de ton organisation.
            </p>
          </div>

          <Link
            href="/org"
            className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            title="Dashboard organisateur"
          >
            ← Retour organizer
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-semibold">Ajouter un membre</h2>
        <p className="mt-2 text-sm text-white/60">
          Saisis l’email du membre à inviter dans ton staff.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="email@domaine.com"
            className="min-w-[240px] flex-1 rounded-xl border border-white/15 bg-black/40 px-4 py-3 text-white outline-none placeholder:text-white/40 focus:border-[#7A3CFF]"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={submitting || !canSubmit}
            className="inline-flex rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Ajout…" : "Ajouter"}
          </button>
        </div>
        <p className="mt-3 text-xs text-white/40">
          Le compte doit exister et avoir le rôle <span className="text-white/70">STAFF</span>.
        </p>

        {banner ? (
          <div
            className={`mt-4 rounded-xl border p-4 text-sm ${
              banner.type === "success"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
                : "border-red-500/30 bg-red-500/10 text-red-200"
            }`}
          >
            {banner.message}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Membres du staff</h2>
            {!loading ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/70">
                {staff.length}
              </span>
            ) : null}
          </div>
          {loading ? (
            <span className="text-sm text-white/50">Chargement…</span>
          ) : null}
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-white/60">Récupération du staff…</p>
        ) : hasStaff ? (
          <ul className="mt-4 divide-y divide-white/10">
            {sortedStaff.map((row) => (
              <li
                key={row.staff_user_id}
                className="flex flex-wrap items-center justify-between gap-4 py-4"
              >
                <div>
                  <p className="font-medium">
                    {row.staff_display_name || row.staff_email || "—"}
                  </p>
                  <p className="text-sm text-white/60">
                    {row.staff_email || "Email indisponible"}
                  </p>
                  <p className="text-xs text-white/40">
                    {row.staff_role ? row.staff_role.toUpperCase() : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(row.staff_user_id)}
                  disabled={
                    removingId === row.staff_user_id ||
                    row.staff_user_id === row.organizer_id
                  }
                  title={
                    row.staff_user_id === row.organizer_id
                      ? "Impossible de se retirer soi-même"
                      : undefined
                  }
                  className="inline-flex rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium hover:bg-white/10 disabled:opacity-60"
                >
                  {removingId === row.staff_user_id ? "Retrait…" : "Retirer"}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-white/60">
            Aucun membre de staff pour le moment.
          </p>
        )}
      </div>
    </section>
  );
}
