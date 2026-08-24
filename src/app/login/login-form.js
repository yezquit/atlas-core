"use client";

import { useState } from "react";

export default function LoginForm() {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result?.message || "No fue posible iniciar sesión.");
        return;
      }
      window.location.assign("/");
    } catch {
      setMessage("No fue posible contactar Atlas. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <label htmlFor="atlas-username">Usuario</label>
      <input
        id="atlas-username"
        name="username"
        type="text"
        autoComplete="username"
        maxLength={128}
        required
      />
      <label htmlFor="atlas-password">Contraseña</label>
      <input
        id="atlas-password"
        name="password"
        type="password"
        autoComplete="current-password"
        maxLength={256}
        required
      />
      <button type="submit" disabled={submitting}>
        {submitting ? "Verificando…" : "Entrar"}
      </button>
      <p className="login-feedback" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}
