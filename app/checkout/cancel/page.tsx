import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <section className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-8 text-center shadow-[0_0_30px_rgba(255,0,153,0.15)]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#FF0099]/15 text-xl">
          ✕
        </div>

        <h1 className="mt-6 text-3xl font-bold">Paiement annulé</h1>
        <p className="mt-3 text-white/70">Aucun débit n’a été effectué.</p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/events"
            className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-6 py-3 font-medium text-white hover:opacity-90"
          >
            Revenir aux événements
          </Link>
        </div>
      </div>
    </section>
  );
}
