import { buildSimpleDirectorPresentation } from "../modules/directorAtlas.js";

function normalizedLine(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameLine(left, right) {
  const a = normalizedLine(left);
  const b = normalizedLine(right);

  if (a === null || b === null) {
    return a === b;
  }

  return Math.abs(a - b) < 0.000001;
}

export function registrationPresentation(analysis) {
  return buildSimpleDirectorPresentation(analysis?.director, {
    geminiItems: analysis?.gemini_context?.items || [],
    historicalQuote: analysis?.historicalQuote || null,
  });
}

export function assertAtlasAuthorizesBet(analysis) {
  const presentation = registrationPresentation(analysis);

  if (presentation?.analysis_decision?.status !== "yes") {
    throw new Error(
      "La apuesta no puede registrarse porque Atlas no tiene un dictamen deportivo SÍ."
    );
  }

  if (presentation?.price_decision?.status !== "yes") {
    throw new Error(
      "La apuesta no puede registrarse porque la decisión final de precio no es APOSTAR."
    );
  }

  return presentation;
}

export function currentActiveQuote(analysis) {
  const quote = analysis?.active_quote || null;
  const director = analysis?.director || null;

  if (!quote) {
    throw new Error("El análisis no tiene una cuota activa.");
  }

  if (quote.stale === true || quote.freshness !== "fresh") {
    throw new Error("La cuota activa ya no está vigente.");
  }

  if (quote.fixture_id !== director?.fixture?.fixture_id) {
    throw new Error("La cuota activa no pertenece al fixture del análisis.");
  }

  if (quote.market_family !== director?.market_evaluated?.family) {
    throw new Error("La cuota activa no corresponde al mercado analizado.");
  }

  if (String(quote.selection || "").trim() !== String(director?.selection || "").trim()) {
    throw new Error("La cuota activa no corresponde a la selección analizada.");
  }

  if (!sameLine(quote.line, director?.line)) {
    throw new Error("La cuota activa no corresponde a la línea analizada.");
  }

  if (
    Number.isFinite(Number(director?.odds)) &&
    Math.abs(Number(quote.decimal_odds) - Number(director.odds)) >= 0.000001
  ) {
    throw new Error("La cuota activa no coincide con la cuota evaluada por DirectorAtlas.");
  }

  return quote;
}
