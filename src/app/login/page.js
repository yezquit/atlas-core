import { redirect } from "next/navigation";

import { currentPersonalSession } from "@/core/auth/personalSessionServer";
import LoginForm from "./login-form";
import Image from "next/image";

export const metadata = {
  title: "Iniciar sesión · Atlas",
};

export default async function LoginPage() {
  if (await currentPersonalSession()) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand-visual">
          <Image className="yezquit-brand-mark" src="/brand/yezquit-master.png" width="1536" height="1024" alt="Identidad maestra YEZQUIT" priority />
        </div>
        <div className="login-access">
          <p className="eyebrow">Inteligencia Deportiva</p>
          <h1 id="login-title">ATLAS</h1>
          <p className="atlas-byline">by <strong>YEZQUIT</strong></p>
          <p className="subtitle">Comprender antes de decidir.</p>
          <LoginForm />
          <p className="login-disclaimer">
            Acceso personal. Atlas analiza evidencia deportiva y no promete ganancias.
          </p>
        </div>
      </section>
    </main>
  );
}
