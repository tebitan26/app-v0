"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useSessionProfile } from "../../../lib/useSessionProfile";

export default function NewEventPage() {
  const router = useRouter();
  const { loading, role } = useSessionProfile();

  const allowed = role === "ORGANIZER" || role === "ADMIN";

  const [title, setTitle] = useState("");
  const [city, setCity] = useState("");
  const [venueName, setVenueName] = useState("");
  const [startAt, setStartAt] = useState("");
  const [doorsAt, setDoorsAt] = useState("");
  const [description, setDescription] = useState("");

  const [unlockHours, setUnlockHours] = useState(2);
  const [resaleCutoffHours, setResaleCutoffHours] = useState(2);

  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user) {
      setStatus("error");
      setMessage("Tu dois être connecté.");
      return;
    }

    if (!title.trim() || !city.trim() || !startAt) {
      setStatus("error");
      setMessage("Titre, ville et date/heure de début sont obligatoires.");
      return;
    }

    const payload = {
      organizer_id: user.id,
      title: title.trim(),
      city: city.trim(),
      venue_name: venueName.trim() ? venueName.trim() : null,
      start_at: new Date(startAt).toISOString(),
      doors_at: doorsAt ? new Date(doorsAt).toISOString() : null,
      description: description.trim() ? description.trim() : null,
      ticket_unlock_hours: unlockHours,
      resale_cutoff_hours: resaleCutoffHours,
      status: "DRAFT" as const,
    };

    const { data, error } = await supabase
      .from("events")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    router.push(`/org/events/${data.id}`);
  }

  if (loading) return <p className="text-white/70">Chargement…</p>;

  if (!allowed) return <p className="text-white/70">Accès refusé.</p>;

  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Créer un événement</h1>
        <p className="mt-2 text-white/70">
          V0 = General Admission. Tu ajoutes les lots juste après.
        </p>
      </div>

      <form
        onSubmit={createEvent}
        className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm text-white/70">Titre *</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Ex: Concert Sidetick"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Ville *</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              placeholder="Ex: Paris"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Salle / lieu</label>
            <input
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              placeholder="Ex: Le Trianon"
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Début (date/heure) *</label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="text-sm text-white/70">Ouverture des portes</label>
            <input
              type="datetime-local"
              className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
              value={doorsAt}
              onChange={(e) => setDoorsAt(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-white/70">Unlock QR (h)</label>
              <input
                type="number"
                min={1}
                max={72}
                className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
                value={unlockHours}
                onChange={(e) => setUnlockHours(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="text-sm text-white/70">Cutoff revente (h)</label>
              <input
                type="number"
                min={1}
                max={72}
                className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
                value={resaleCutoffHours}
                onChange={(e) => setResaleCutoffHours(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm text-white/70">Description</label>
          <textarea
            className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 outline-none focus:border-[#7A3CFF]/60"
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Quelques infos…"
          />
        </div>

        {message ? (
          <p className={status === "error" ? "text-sm text-red-300" : "text-sm text-white/70"}>
            {message}
          </p>
        ) : null}

        <button
          disabled={status === "saving"}
          className="rounded-xl bg-[#7A3CFF] px-5 py-3 font-medium hover:opacity-90 disabled:opacity-60"
        >
          {status === "saving" ? "Création…" : "Créer (draft)"}
        </button>
      </form>
    </section>
  );
}