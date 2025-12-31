"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  city: string;
  venue_name: string | null;
  start_at: string;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
};

type BatchRow = {
  id: string;
  event_id: string;
  name: string;
  price_cents: number;
  currency: string;
  quantity_total: number;
  quantity_sold: number;
  sale_start: string | null;
  sale_end: string | null;
  created_at: string;
};

function euroToCents(input: string) {
  const normalized = input.replace(",", ".").trim();
  const n = Number(normalized);
  if (Number.isNaN(n) || !Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export default function EventDetailPage() {
  const params = useParams();

  const eventId = useMemo(() => {
    const raw = (params as any)?.id;
    return Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  }, [params]);

  const [event, setEvent] = useState<EventRow | null>(null);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Create batch form state (V0)
  const [creating, setCreating] = useState(false);
  const [batchName, setBatchName] = useState("General Admission");
  const [batchPriceEur, setBatchPriceEur] = useState("10");
  const [batchQty, setBatchQty] = useState("100");
  const [batchSaleStart, setBatchSaleStart] = useState("");
  const [batchSaleEnd, setBatchSaleEnd] = useState("");
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPriceEur, setEditPriceEur] = useState("");
  const [editQty, setEditQty] = useState("");

  async function reload() {
    if (!eventId) return;

    setLoading(true);
    setErr(null);

    const { data: ev, error: evErr } = await supabase
      .from("events")
      .select("id,title,description,city,venue_name,start_at,status")
      .eq("id", eventId)
      .single();

    if (evErr) {
      setErr(evErr.message);
      setEvent(null);
      setBatches([]);
      setLoading(false);
      return;
    }

    const { data: bt, error: btErr } = await supabase
      .from("ticket_batches")
      .select(
        "id,event_id,name,price_cents,currency,quantity_total,quantity_sold,sale_start,sale_end,created_at"
      )
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (btErr) setErr(btErr.message);

    setEvent(ev as EventRow);
    setBatches((bt ?? []) as BatchRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!eventId) return;

    (async () => {
      await reload();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const capacityTotal = batches.reduce((sum, b) => sum + (b.quantity_total || 0), 0);
  const soldTotal = batches.reduce((sum, b) => sum + (b.quantity_sold || 0), 0);
  const remainingTotal = Math.max(0, capacityTotal - soldTotal);

  async function onCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    if (!eventId) return;

    setErr(null);

    const priceCents = euroToCents(batchPriceEur);
    if (priceCents === null || priceCents < 0) {
      setErr("Prix invalide (ex: 12.50)");
      return;
    }

    const qty = Number(batchQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr("Quantité invalide (doit être > 0)");
      return;
    }

    // Optional datetimes (empty -> null)
    const saleStart = batchSaleStart.trim() ? new Date(batchSaleStart).toISOString() : null;
    const saleEnd = batchSaleEnd.trim() ? new Date(batchSaleEnd).toISOString() : null;

    setCreating(true);

    const { error: insErr } = await supabase.from("ticket_batches").insert({
      event_id: eventId,
      name: batchName.trim() || "General Admission",
      price_cents: priceCents,
      currency: "EUR",
      quantity_total: qty,
      sale_start: saleStart,
      sale_end: saleEnd,
    });

    if (insErr) {
      setErr(insErr.message);
      setCreating(false);
      return;
    }

    // Reset minimal fields for fast entry
    setBatchName("General Admission");
    setBatchQty("100");
    setBatchSaleStart("");
    setBatchSaleEnd("");

    await reload();
    setCreating(false);
  }

  async function onDeleteBatch(batchId: string) {
    if (!eventId) return;

    const target = batches.find((b) => b.id === batchId);
    if (target && target.quantity_sold > 0) {
      alert("Impossible de supprimer un lot qui a déjà des ventes.");
      return;
    }

    const ok = confirm("Supprimer ce lot ?");
    if (!ok) return;

    setErr(null);

    const { error: delErr } = await supabase
      .from("ticket_batches")
      .delete()
      .eq("id", batchId)
      .eq("event_id", eventId);

    if (delErr) {
      console.error("delete batch error", delErr);
      alert(delErr.message);
      setErr(delErr.message);
      return;
    }

    await reload();
  }

  async function onUpdateBatch(e: React.FormEvent, batch: BatchRow) {
    e.preventDefault();
    if (!eventId) return;

    setErr(null);

    const priceCents = euroToCents(editPriceEur);
    if (priceCents === null || priceCents < 0) {
      setErr("Prix invalide (ex: 12.50)");
      return;
    }

    const qty = Number(editQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setErr("Quantité invalide (doit être > 0)");
      return;
    }

    const { error: updErr } = await supabase
      .from("ticket_batches")
      .update({
        name: editName.trim() || batch.name,
        price_cents: priceCents,
        quantity_total: qty,
      })
      .eq("id", batch.id)
      .eq("event_id", eventId);

    if (updErr) {
      setErr(updErr.message);
      return;
    }

    setEditingBatchId(null);
    await reload();
  }

  return (
    <section className="space-y-6">
      <Link href="/org" className="text-sm text-white/70 hover:text-white">
        ← Retour organisateur
      </Link>

      {err ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">
          {err}
        </div>
      ) : null}

      {loading && !event ? (
        <p className="text-white/60">Chargement…</p>
      ) : !event ? (
        <p className="text-white/60">Événement introuvable.</p>
      ) : (
        <>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h1 className="text-3xl font-bold">{event.title}</h1>
            <p className="mt-2 text-white/70">
              {new Date(event.start_at).toLocaleString()} · {event.city}
              {event.venue_name ? ` · ${event.venue_name}` : ""}
            </p>
            {event.description ? (
              <p className="mt-4 text-white/80">{event.description}</p>
            ) : null}

            {/* ✅ Publish / Draft toggle */}
            <div className="mt-4 flex items-center gap-3">
              <span className="text-xs rounded-full border border-white/15 bg-white/5 px-2 py-1 text-white/70">
                Statut: <span className="text-white">{event.status}</span>
              </span>

              <button
                onClick={async () => {
                  if (!eventId) return;
                  setErr(null);

                  const nextStatus = event.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
                  const { error } = await supabase
                    .from("events")
                    .update({ status: nextStatus })
                    .eq("id", eventId);

                  if (error) {
                    setErr(error.message);
                    return;
                  }

                  await reload();
                }}
                title={event.status === "PUBLISHED" ? "Mettre en brouillon" : "Mettre en ligne"}
                disabled={loading}
                className={`rounded-xl border px-4 py-2 text-sm hover:bg-white/10 ${
                  event.status === "PUBLISHED"
                    ? "bg-red-500/10 text-red-200 hover:bg-red-500/15 border-red-500/30"
                    : "bg-green-500/10 text-green-200 hover:bg-green-500/15 border-green-500/30"
                }`}
              >
                {event.status === "PUBLISHED" ? "Mettre en brouillon" : "Mettre en ligne"}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Billets</h2>
                <p className="mt-1 text-sm text-white/60">
                  Capacité: <span className="text-white">{capacityTotal}</span> · Vendu:{" "}
                  <span className="text-white">{soldTotal}</span> · Restants:{" "}
                  <span className="text-white">{remainingTotal}</span>
                </p>
              </div>
            </div>

            {/* Create batch (V0) */}
            <form
              onSubmit={onCreateBatch}
              className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <h3 className="font-medium">Créer un lot</h3>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm text-white/70">Nom</span>
                  <input
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                    placeholder="General Admission"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-white/70">Prix (€)</span>
                  <input
                    value={batchPriceEur}
                    onChange={(e) => setBatchPriceEur(e.target.value)}
                    inputMode="decimal"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                    placeholder="10"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm text-white/70">Quantité</span>
                  <input
                    value={batchQty}
                    onChange={(e) => setBatchQty(e.target.value)}
                    inputMode="numeric"
                    className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                    placeholder="100"
                  />
                </label>

                <div className="space-y-1">
                  <span className="text-sm text-white/70">Fenêtre de vente (optionnel)</span>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={batchSaleStart}
                      onChange={(e) => setBatchSaleStart(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                      placeholder="Début (ISO)"
                      title="Optionnel. Exemple: 2026-02-01T10:00:00Z"
                    />
                    <input
                      value={batchSaleEnd}
                      onChange={(e) => setBatchSaleEnd(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                      placeholder="Fin (ISO)"
                      title="Optionnel. Exemple: 2026-02-01T20:00:00Z"
                    />
                  </div>
                  <p className="text-xs text-white/45">
                    V0: tu peux laisser vide. On ajoutera un datepicker plus tard.
                  </p>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-xl bg-[#7A3CFF] px-5 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
                >
                  {creating ? "Création…" : "Ajouter le lot"}
                </button>
              </div>
            </form>

            {batches.length === 0 ? (
              <p className="mt-4 text-white/60">Aucun lot disponible.</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {batches.map((b) => {
                  const remaining = b.quantity_total - b.quantity_sold;
                  return (
                    <li
                      key={b.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{b.name}</p>
                          <p className="mt-1 text-sm text-white/60">
                            {(b.price_cents / 100).toFixed(2)} {b.currency} · Total:{" "}
                            {b.quantity_total} · Vendu: {b.quantity_sold} · Restants:{" "}
                            {remaining}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                            onClick={() => {
                              setEditingBatchId(b.id);
                              setEditName(b.name);
                              setEditPriceEur((b.price_cents / 100).toFixed(2));
                              setEditQty(String(b.quantity_total));
                            }}
                          >
                            Modifier
                          </button>

                          <button
                            className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                            onClick={() =>
                              alert("Sprint suivant : Checkout Stripe (achat primaire)")
                            }
                          >
                            Démo acheter
                          </button>

                          <button
                            className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm text-red-200 hover:bg-red-500/15 disabled:opacity-60"
                            onClick={() => onDeleteBatch(b.id)}
                            title={
                              b.quantity_sold > 0
                                ? "Déjà vendu: suppression bloquée"
                                : "Supprimer"
                            }
                            disabled={b.quantity_sold > 0}
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>

                      {editingBatchId === b.id ? (
                        <form
                          onSubmit={(e) => onUpdateBatch(e, b)}
                          className="mt-4 rounded-xl border border-white/10 bg-black/30 p-4"
                        >
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <label className="space-y-1">
                              <span className="text-sm text-white/70">Nom</span>
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                              />
                            </label>

                            <label className="space-y-1">
                              <span className="text-sm text-white/70">Prix (€)</span>
                              <input
                                value={editPriceEur}
                                onChange={(e) => setEditPriceEur(e.target.value)}
                                inputMode="decimal"
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                              />
                            </label>

                            <label className="space-y-1">
                              <span className="text-sm text-white/70">Quantité</span>
                              <input
                                value={editQty}
                                onChange={(e) => setEditQty(e.target.value)}
                                inputMode="numeric"
                                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/20"
                              />
                            </label>
                          </div>

                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingBatchId(null)}
                              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                            >
                              Annuler
                            </button>
                            <button
                              type="submit"
                              className="rounded-xl bg-[#7A3CFF] px-4 py-2 text-sm font-medium hover:opacity-90"
                            >
                              Enregistrer
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
