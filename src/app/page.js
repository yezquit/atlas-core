import AtlasFunctionalClient from "./atlas-functional-client";
import { groupApiFootballCompetitions } from "@/core/data/apiFootballLeagues";
import { currentPersonalSession } from "@/core/auth/personalSessionServer";
import { SPORTS_MARKETS } from "@/core/intelligence/marketEngine";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function Home() {
  const session = await currentPersonalSession();
  if (!session) redirect("/login");

  const competitionGroups = groupApiFootballCompetitions();
  const defaultTimezone = process.env.ATLAS_DEFAULT_TIMEZONE || "America/Bogota";

  return (
    <main className="atlas-page">
      <section className="hero-card functional-shell">
        <header className="atlas-brand-header">
          <div className="atlas-product-lockup">
            <p className="eyebrow">Inteligencia Deportiva</p>
            <h1>ATLAS</h1>
            <p className="atlas-byline">by <strong>YEZQUIT</strong></p>
          </div>
          <Image className="yezquit-brand-signature" src="/brand/yezquit-master.png" width="1254" height="1254" alt="Identidad maestra YEZQUIT" priority unoptimized />
        </header>
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
          ownerId={session.ownerId}
        />
      </section>
    </main>
  );
}
