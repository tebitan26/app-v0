import Link from "next/link";

export default function Home() {
  return (
    <section>
      <h1 className="text-4xl font-bold leading-tight md:text-6xl">
        Billetterie Web2
        <span className="text-[#7A3CFF]"> anti-fraude</span>,
        <br />
        revente officielle &amp; fan score.
      </h1>

      <p className="mt-6 max-w-2xl text-lg text-white/80">
        Version V0 de Sidetick : vente primaire, vente secondaire capée, billets
        débloqués 2h avant l’événement, et un fan score global.
      </p>

      <div className="mt-10 flex flex-col gap-4 sm:flex-row">
        <Link
          href="/events"
          className="inline-flex items-center justify-center rounded-xl bg-[#7A3CFF] px-6 py-3 font-medium text-white hover:opacity-90"
        >
          Voir les événements
        </Link>

        <Link
          href="/org"
          className="inline-flex items-center justify-center rounded-xl border border-white/20 px-6 py-3 font-medium text-white hover:bg-white/10"
        >
          Espace organisateur
        </Link>
      </div>

      <div className="mt-14 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-white/60">Primaire</div>
          <div className="mt-2 font-semibold">Achat simple + paiement Stripe</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-white/60">Secondaire</div>
          <div className="mt-2 font-semibold">Revente capée + 10% frais</div>
          <div className="mt-2 text-sm text-white/70">
            “frais de gestion &amp; revenu artistes”
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-sm text-white/60">Anti-fraude</div>
          <div className="mt-2 font-semibold">QR visible uniquement à T-2h</div>
        </div>
      </div>

      <div className="mt-10 text-sm text-white/60">
        Couleurs Sidetick: <span className="text-white">#1B003B</span> /{" "}
        <span className="text-[#7A3CFF]">#7A3CFF</span> /{" "}
        <span className="text-[#FF0099]">#FF0099</span> /{" "}
        <span className="text-[#FB4437]">#FB4437</span>
      </div>
    </section>
  );
}