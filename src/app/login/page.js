import { redirect } from "next/navigation";

import { currentPersonalSession } from "@/core/auth/personalSessionServer";
import LoginForm from "./login-form";

export const metadata = {
  title: "Iniciar sesión · Atlas",
};

export default async function LoginPage() {
  if (await currentPersonalSession()) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="eyebrow">Atlas Personal V2</p>
        <h1 id="login-title">ATLAS</h1>
        <p className="subtitle">Comprender antes de decidir.</p>
        <LoginForm />
        <p className="login-disclaimer">
          Acceso personal. Atlas analiza evidencia deportiva y no promete ganancias.
        </p>
      </section>
    </main>
  );
}
