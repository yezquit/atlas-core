import AtlasFunctionalClient from "./atlas-functional-client";
import { groupApiFootballCompetitions } from "@/core/data/apiFootballLeagues";
import { SPORTS_MARKETS } from "@/core/intelligence/marketEngine";

export default function Home() {
  const competitionGroups = groupApiFootballCompetitions();

  return (
    <main className="atlas-page">
      <section className="hero-card functional-shell">
        <p className="eyebrow">Atlas Sports Intelligence · Fase 2</p>
        <h1>ATLAS</h1>
        <p className="subtitle">Comprender antes de decidir.</p>
        <p className="functional-intro">
          Explora una jornada o estudia un partido exacto con evidencia
          verificable. Atlas explica respaldo, límites y faltantes; no promete
          ganancias ni inventa probabilidades.
        </p>

        <AtlasFunctionalClient
          competitionGroups={competitionGroups}
          markets={SPORTS_MARKETS}
        />
      </section>
    </main>
  );
}
