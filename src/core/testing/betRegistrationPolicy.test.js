import test from "node:test";
import assert from "node:assert/strict";

import {
  assertAtlasAuthorizesBet,
  currentActiveQuote,
} from "../intelligence/betRegistrationPolicy.js";

function authorizedAnalysis(overrides = {}) {
  const analysis = {
    analysis_id: "0362b7d3-295d-43d9-a022-7d5c24ac6a0f",

    active_quote: {
      fixture_id: 1520819,
      bookmaker_name: "Betano",
      market_family: "goals",
      selection: "Under 2.5",
      line: "2.5",
      decimal_odds: 1.83,
      freshness: "fresh",
      source_status: "user_reported_current",
      stale: false,
    },

    director: {
      fixture: {
        fixture_id: 1520819,
      },

      market_evaluated: {
        family: "goals",
      },

      selection: "Under 2.5",
      line: 2.5,
      odds: 1.83,

      sports_verdict: {
        status: "sports_candidate",
      },

      decision_code: "caution",

      price_assessment: {
        status: "marginal",
        freshness: "fresh",
        source_status: "user_reported_current",
        message: "La cuota mantiene una ventaja preliminar positiva.",
      },

      primary_supporting_evidence:
        "La evidencia disponible sostiene esta selección.",
    },

    gemini_context: {
      items: [],
    },
  };

  return {
    ...analysis,
    ...overrides,
    active_quote: {
      ...analysis.active_quote,
      ...(overrides.active_quote || {}),
    },
    director: {
      ...analysis.director,
      ...(overrides.director || {}),
      fixture: {
        ...analysis.director.fixture,
        ...(overrides.director?.fixture || {}),
      },
      market_evaluated: {
        ...analysis.director.market_evaluated,
        ...(overrides.director?.market_evaluated || {}),
      },
      sports_verdict: {
        ...analysis.director.sports_verdict,
        ...(overrides.director?.sports_verdict || {}),
      },
      price_assessment: {
        ...analysis.director.price_assessment,
        ...(overrides.director?.price_assessment || {}),
      },
    },
  };
}

test("Betano 1.83 vigente y marginal positivo autoriza APOSTAR", () => {
  const analysis = authorizedAnalysis();

  const presentation = assertAtlasAuthorizesBet(analysis);
  const quote = currentActiveQuote(analysis);

  assert.equal(presentation.analysis_decision.status, "yes");
  assert.equal(presentation.price_decision.status, "yes");
  assert.equal(presentation.price_decision.label, "APOSTAR");

  assert.equal(quote.bookmaker_name, "Betano");
  assert.equal(quote.decimal_odds, 1.83);
  assert.equal(quote.line, "2.5");
});

test("una cuota vencida no puede registrarse", () => {
  const analysis = authorizedAnalysis({
    active_quote: {
      stale: true,
      freshness: "stale",
    },
  });

  assert.throws(
    () => currentActiveQuote(analysis),
    /cuota activa ya no está vigente/
  );
});

test("una línea distinta no puede registrarse", () => {
  const analysis = authorizedAnalysis({
    active_quote: {
      line: "3.5",
    },
  });

  assert.throws(
    () => currentActiveQuote(analysis),
    /cuota activa no corresponde a la línea analizada/
  );
});

test("NO APOSTAR impide registrar la apuesta", () => {
  const analysis = authorizedAnalysis({
    director: {
      price_assessment: {
        status: "unfavorable",
      },
    },
  });

  assert.throws(
    () => assertAtlasAuthorizesBet(analysis),
    /decisión final de precio no es APOSTAR/
  );
});
