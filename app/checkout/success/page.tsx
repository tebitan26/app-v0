import Link from "next/link";

export default function CheckoutSuccessPage() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_0_40px_rgba(122,60,255,0.18)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#7A3CFF]/20 text-2xl">
          ✅
        </div>

        <h1 className="mt-6 text-3xl font-bold">Paiement confirmé ✅</h1>
        <p className="mt-3 text-white/70">
          Ton billet est disponible dans Mes billets.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/me/tickets"
            className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-6 py-3 font-medium text-white hover:opacity-90"
          >
            Aller à Mes billets
          </Link>
          <Link
            href="/events"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-medium text-white hover:bg-white/10"
          >
            Retour aux événements
          </Link>
        </div>
      </div>
    </section>
  );
}
