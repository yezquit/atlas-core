import AtlasFunctionalClient from "./atlas-functional-client";
import { listApiFootballLeagues } from "@/core/data/apiFootballLeagues";
import { FUNCTIONAL_MARKETS } from "@/core/modules/marketDataCoverage";

export default function Home() {
  const leagues = listApiFootballLeagues();

  return (
    <main className="atlas-page">
      <section className="hero-card functional-shell">
        <p className="eyebrow">Atlas Core · Fase 1</p>
        <h1>ATLAS</h1>
        <p className="subtitle">Comprender antes de decidir.</p>
        <p className="functional-intro">
          Elige fecha y liga, carga los partidos disponibles y selecciona un
          fixture por su ID. Atlas solo analizará esa selección explícita.
        </p>

        <AtlasFunctionalClient leagues={leagues} markets={FUNCTIONAL_MARKETS} />
      </section>
    </main>
  );
}
