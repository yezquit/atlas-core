import AtlasFunctionalClient from "./atlas-functional-client";
import { groupApiFootballCompetitions } from "@/core/data/apiFootballLeagues";
import { SPORTS_MARKETS } from "@/core/intelligence/marketEngine";

export default function Home() {
  const competitionGroups = groupApiFootballCompetitions();
  const defaultTimezone = process.env.ATLAS_DEFAULT_TIMEZONE || "America/Bogota";

  return (
    <main className="atlas-page">
      <section className="hero-card functional-shell">
        <p className="eyebrow">Atlas Sports Intelligence · Operativo local</p>
        <h1>ATLAS</h1>
        <p className="subtitle">Comprender antes de decidir.</p>
        <p className="functional-intro">
          Explora jornadas, estudia un partido exacto, valida contexto manual y
          conserva cada versión. Atlas explica respaldo, límites y faltantes;
          no promete ganancias ni inventa probabilidades.
        </p>

        <AtlasFunctionalClient
          competitionGroups={competitionGroups}
          markets={SPORTS_MARKETS}
          defaultTimezone={defaultTimezone}
        />
      </section>
    </main>
  );
}
