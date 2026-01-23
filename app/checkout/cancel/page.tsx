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
        <p className="mt-2 text-sm text-white/60">
          Tu peux reprendre l’achat quand tu veux — ton billet n’est pas réservé tant que le paiement n’est pas finalisé.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/events"
            className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-6 py-3 font-medium text-white hover:opacity-90"
          >
            Retour aux évènements
          </Link>
          <Link
            href="/marketplace"
            className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 font-medium text-white hover:bg-white/10"
          >
            Voir la marketplace
          </Link>
        </div>
        <p className="mt-6 text-xs text-white/40">
          Besoin d’aide ? Vérifie ton email de confirmation ou réessaie dans quelques secondes.
        </p>
      </div>
    </section>
  );
}
