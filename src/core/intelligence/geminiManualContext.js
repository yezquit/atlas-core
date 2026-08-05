import {
  GEMINI_ITEM_KIND,
  SOURCE_CLASSIFICATION,
} from "../contracts/operationalContracts.js";

const SECTION_ALIASES = Object.freeze({
  confirmed: GEMINI_ITEM_KIND.CONFIRMED,
  "hechos confirmados": GEMINI_ITEM_KIND.CONFIRMED,
  probable: GEMINI_ITEM_KIND.PROBABLE,
  "informacion probable": GEMINI_ITEM_KIND.PROBABLE,
  rumores: GEMINI_ITEM_KIND.RUMOR,
  rumor: GEMINI_ITEM_KIND.RUMOR,
  contradicciones: GEMINI_ITEM_KIND.CONTRADICTION,
  contradiccion: GEMINI_ITEM_KIND.CONTRADICTION,
  "datos no encontrados": GEMINI_ITEM_KIND.NOT_FOUND,
  "no encontrados": GEMINI_ITEM_KIND.NOT_FOUND,
  "not found": GEMINI_ITEM_KIND.NOT_FOUND,
});

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function extractUrls(text) {
  return [...new Set(String(text || "").match(/https?:\/\/[^\s)>\]}]+/gi) || [])]
    .map((url) => url.replace(/[.,;:]+$/, ""));
}

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

const TRUSTED_SOURCE_CLASSES = new Set([
  SOURCE_CLASSIFICATION.OFFICIAL_COMPETITION,
  SOURCE_CLASSIFICATION.OFFICIAL_CLUB,
  SOURCE_CLASSIFICATION.FEDERATION,
  SOURCE_CLASSIFICATION.RECOGNIZED_MEDIA,
]);

function summarize(content, maximumLength = 180) {
  const clean = String(content || "")
    .replace(/https?:\/\/[^\s)>\]}]+/gi, "")
    .replace(/^\s*[•*-]+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= maximumLength) return clean;
  const shortened = clean.slice(0, maximumLength - 1);
  const boundary = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, boundary > maximumLength * 0.65 ? boundary : maximumLength - 1).trim()}…`;
}

function affectedMarkets(content) {
  const candidate = normalize(content);
  const markets = new Set();
  if (/delanter|goleador|atacante|alineaci|lesion|sancion|rotacion|fatiga|campo|cesped|lluvia|viento|clima/.test(candidate)) {
    markets.add("goals");
  }
  if (/extremo|lateral|carrilero|campo|cesped|lluvia|viento|clima/.test(candidate)) markets.add("corners");
  if (/arbitro|tarjeta|falta|sancion/.test(candidate)) markets.add("cards");
  if (/delanter|atacante|extremo|lateral|carrilero|alineaci|rotacion|campo|cesped|lluvia|viento|clima/.test(candidate)) {
    markets.add("total_shots");
    markets.add("shots_on_goal");
  }
  return [...markets];
}

function inferImpact(kind, content) {
  if (kind === GEMINI_ITEM_KIND.CONTRADICTION || kind === GEMINI_ITEM_KIND.NOT_FOUND) return "limiting";
  if (kind === GEMINI_ITEM_KIND.RUMOR) return "neutral";
  const candidate = normalize(content);
  if (/favorece|respalda|beneficia/.test(candidate)) return "favorable";
  if (/perjudica|debilita|contrario a|en contra de/.test(candidate)) return "unfavorable";
  if (/lesion|baja|sancion|ausencia|rotacion|fatiga|suspendid|duda|probable|sin confirmar|mal estado/.test(candidate)) return "limiting";
  return "neutral";
}

function isGenericSupportPage(domains) {
  return domains.some((domain) => /^(?:support|weather)\.google\./.test(domain) || /^support\./.test(domain));
}

function isPredictionOpinion(content, domains) {
  const candidate = normalize(content);
  return /pronostico|apuesta|pick\b|tipster|cuota recomendada/.test(candidate) || domains.some((domain) => /tipster|betting|apuestas/.test(domain));
}

function isAlreadyKnownFixtureData(content) {
  const candidate = normalize(content);
  const knownTerms = ["horario", "hora del partido", "sede", "estadio", "fixture", "equipos"];
  return knownTerms.some((term) => candidate.includes(term)) && !/lesion|alineaci|rotacion|campo|cesped|clima|arbitro|sancion/.test(candidate);
}

function impactExplanation(kind, impact, markets) {
  if (kind === GEMINI_ITEM_KIND.CONTRADICTION) return "Existe una contradicción que requiere revisión manual antes de utilizarla.";
  if (kind === GEMINI_ITEM_KIND.NOT_FOUND) return "Registra una limitación de información; no constituye evidencia favorable ni contraria.";
  if (kind === GEMINI_ITEM_KIND.RUMOR) return "Es un rumor y no se incorpora automáticamente al análisis.";
  if (!markets.length) return "No se pudo vincular el dato con una variable deportiva del mercado actual.";
  if (impact === "favorable") return "El texto declara un efecto favorable, sujeto a verificación de fuente y contexto.";
  if (impact === "unfavorable") return "El texto declara un efecto desfavorable, sujeto a verificación de fuente y contexto.";
  if (impact === "limiting") return "El dato es relevante, pero su vigencia o confirmación limita el dictamen.";
  return "No existe comparación suficiente para asignar una dirección deportiva sin inventarla.";
}

function buildItem(content, kind, index, sourceOptions) {
  const urls = extractUrls(content);
  const dates = content.match(/\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/g) || [];
  const domains = urls.map(hostname).filter(Boolean);
  const classifications = urls.map((url) => classifySource(url, sourceOptions));
  const markets = affectedMarkets(content);
  const impact = inferImpact(kind, content);
  const genericSupportPage = isGenericSupportPage(domains);
  const recognizedSource = classifications.some((classification) => TRUSTED_SOURCE_CLASSES.has(classification));
  const sourceIsCurrent = dates.length > 0 || /actualizad|vigente|hoy|ultima hora|última hora/.test(normalize(content));
  const relevantImpact = markets.length > 0 && !isAlreadyKnownFixtureData(content);
  const selected = recognizedSource && sourceIsCurrent && relevantImpact && !genericSupportPage &&
    !isPredictionOpinion(content, domains) && ![
      GEMINI_ITEM_KIND.RUMOR,
      GEMINI_ITEM_KIND.CONTRADICTION,
      GEMINI_ITEM_KIND.NOT_FOUND,
    ].includes(kind);
  return {
    id: `gemini-${index + 1}`,
    kind,
    category: kind,
    summary: summarize(content),
    text: content,
    source: urls[0] || null,
    urls,
    domain: urls[0] ? hostname(urls[0]) : null,
    domains,
    publication_date: dates[0] || null,
    publication_dates: dates,
    provenance: "manual_gemini_paste",
    source_classification: classifications[0] || SOURCE_CLASSIFICATION.UNKNOWN,
    source_classifications: classifications,
    source_is_generic_support: genericSupportPage,
    verification_status: urls.length ? "user_reported" : "unverified",
    validation_status: selected ? "usable_as_context" : urls.length ? "user_reported" : "unverified",
    affected_markets: markets,
    impact,
    impact_explanation: impactExplanation(kind, impact, markets),
    selection_warning: kind === GEMINI_ITEM_KIND.CONTRADICTION ? "Revisa esta contradicción antes de utilizarla." : null,
    selected,
  };
}

function countersFor(items) {
  return {
    detected: items.length,
    selected: items.filter((item) => item.selected).length,
    rejected: items.filter((item) => !item.selected).length,
    rumors: items.filter((item) => item.kind === GEMINI_ITEM_KIND.RUMOR).length,
    limitations: items.filter((item) => [GEMINI_ITEM_KIND.CONTRADICTION, GEMINI_ITEM_KIND.NOT_FOUND].includes(item.kind)).length,
  };
}

export function classifySource(url, { officialClubDomains = [], officialCompetitionDomains = [] } = {}) {
  const domain = hostname(url);
  if (!domain) return SOURCE_CLASSIFICATION.UNKNOWN;
  if (officialClubDomains.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`))) {
    return SOURCE_CLASSIFICATION.OFFICIAL_CLUB;
  }
  if (officialCompetitionDomains.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`)) || /(^|\.)dimayor\.com\.co$/.test(domain)) {
    return SOURCE_CLASSIFICATION.OFFICIAL_COMPETITION;
  }
  if (/(^|\.)(fifa|uefa|conmebol|concacaf|fcf)\.(com|org|com\.co)$/.test(domain)) {
    return SOURCE_CLASSIFICATION.FEDERATION;
  }
  if (/(^|\.)(reuters|apnews|bbc|espn|theguardian)\.(com|co\.uk)$/.test(domain)) {
    return SOURCE_CLASSIFICATION.RECOGNIZED_MEDIA;
  }
  if (/(^|\.)(x|twitter|substack)\.com$/.test(domain)) {
    return SOURCE_CLASSIFICATION.JOURNALIST;
  }
  if (/(^|\.)(sofascore|flashscore|transfermarkt|soccerway)\./.test(domain)) {
    return SOURCE_CLASSIFICATION.AGGREGATOR;
  }
  return SOURCE_CLASSIFICATION.UNKNOWN;
}

export function buildGeminiResearchPrompt({ fixture, competition, market, oddsQuote, verifiedData = [], missingData = [], risks = [], analyzedAt = new Date().toISOString() }) {
  if (!fixture?.fixtureId) throw new TypeError("El prompt Gemini requiere un fixture verificado.");
  const home = fixture.teams?.home?.name || "Equipo local no disponible";
  const away = fixture.teams?.away?.name || "Equipo visitante no disponible";
  return [
    "INVESTIGACIÓN COMPLEMENTARIA MANUAL PARA ATLAS",
    "No recomiendes apostar, no inventes estadísticas y no generes probabilidades.",
    `Fixture ID: ${fixture.fixtureId}`,
    `Competición: ${competition?.localName || fixture.competition?.name || "No disponible"}`,
    `Temporada: ${fixture.competition?.season ?? "No disponible"}`,
    `Fecha y hora UTC: ${fixture.date?.utc || "No disponible"}`,
    `Partido: ${home} vs ${away}`,
    `Mercado: ${market?.market_label || market?.market_family || "Abierto"}`,
    `Selección actual: ${oddsQuote?.selection || "No disponible"}`,
    `Línea actual: ${oddsQuote?.line || market?.line || "No disponible"}`,
    `Cuota actual: ${oddsQuote?.decimal_odds || market?.odds || "No disponible"}`,
    `Hora exacta del análisis: ${analyzedAt}`,
    "",
    "DATOS YA VERIFICADOS POR API:",
    ...(verifiedData.length ? verifiedData.map((item) => `- ${item}`) : ["- Ningún dato adicional enumerado."]),
    "",
    "DATOS FALTANTES:",
    ...(missingData.length ? missingData.map((item) => `- ${item}`) : ["- Ninguno identificado."]),
    "",
    "RIESGOS DETECTADOS:",
    ...(risks.length ? risks.map((item) => `- ${item}`) : ["- Ninguno identificado."]),
    "",
    "Investiga información vigente y cita URL y fecha de publicación para cada hecho. Verifica lesiones, sanciones, alineaciones probables o confirmadas, rotaciones, árbitro, declaraciones de entrenadores, prioridad competitiva, descanso, viajes, clima, estado del campo, noticias de última hora y movimientos de cuotas.",
    "Separa la respuesta exactamente en: HECHOS CONFIRMADOS, INFORMACIÓN PROBABLE, RUMORES, CONTRADICCIONES y DATOS NO ENCONTRADOS.",
    "Para cada elemento incluye fuente, URL y fecha. Si no puedes verificar algo, indícalo. No cambies el fixture, los equipos, la línea ni la cuota proporcionados.",
  ].join("\n");
}

function sectionFromLine(line) {
  const candidate = normalize(line.replace(/^[#*\s\[\]]+|[:*\s\[\]]+$/g, ""));
  return SECTION_ALIASES[candidate] || null;
}

export function parseGeminiResponse(text, { fixture, expectedLine = null, expectedOdds = null, receivedAt = new Date().toISOString(), sourceOptions = {} } = {}) {
  const originalText = String(text || "").trim();
  const items = [];
  let currentKind = null;
  for (const rawLine of originalText.split(/\r?\n/)) {
    const heading = sectionFromLine(rawLine);
    if (heading) {
      currentKind = heading;
      continue;
    }
    const content = rawLine.replace(/^\s*[-*\d.)]+\s*/, "").trim();
    if (!currentKind || !content) continue;
    items.push(buildItem(content, currentKind, items.length, sourceOptions));
  }
  if (!items.length && originalText) {
    const paragraphs = originalText.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      items.push(buildItem(paragraph, GEMINI_ITEM_KIND.PROBABLE, items.length, sourceOptions));
    }
  }
  const urls = extractUrls(originalText);
  const mentionedFixtureIds = [...originalText.matchAll(/fixture(?:\s+id)?\s*[:#-]?\s*(\d+)/gi)].map((match) => Number(match[1]));
  const expectedFixtureId = Number(fixture?.fixtureId);
  const fixtureMismatch = mentionedFixtureIds.some((id) => id !== expectedFixtureId);
  const home = fixture?.teams?.home?.name || "";
  const away = fixture?.teams?.away?.name || "";
  const normalizedText = normalize(originalText);
  const teamsMentioned = [home, away].filter((team) => team && normalizedText.includes(normalize(team)));
  const explicitlyClaimedFixtureDates = [...originalText.matchAll(/(?:fecha\s+del\s+partido|partido|fixture|kickoff)[^\n\d]{0,24}(20\d{2}-\d{2}-\d{2})/gi)].map((match) => match[1]);
  const incompatibleDate = explicitlyClaimedFixtureDates.some(
    (date) => fixture?.date?.utc && date !== fixture.date.utc.slice(0, 10)
  );
  const lineMatches = expectedLine ? normalizedText.includes(normalize(expectedLine)) : true;
  const oddsMatches = expectedOdds ? normalizedText.includes(normalize(expectedOdds)) : true;
  const errors = [
    ...(fixtureMismatch ? ["fixture_mismatch"] : []),
    ...(teamsMentioned.length === 1 ? ["team_context_ambiguous"] : []),
    ...(incompatibleDate ? ["date_mismatch"] : []),
    ...(!lineMatches ? ["line_not_confirmed"] : []),
    ...(!oddsMatches ? ["odds_not_confirmed"] : []),
  ];
  for (const item of items) {
    const itemFixtureIds = [...item.text.matchAll(/fixture(?:\s+id)?\s*[:#-]?\s*(\d+)/gi)].map((match) => Number(match[1]));
    item.fixture_compatible = !itemFixtureIds.some((id) => id !== expectedFixtureId) && !incompatibleDate;
    if (!item.fixture_compatible) {
      item.selected = false;
      item.validation_status = "unverified";
    }
  }
  return {
    contract: "GeminiManualContext",
    version: 1,
    source: "manual_gemini_paste",
    verification_status: "user_reported",
    received_at: receivedAt,
    original_text: originalText,
    fixture_id: expectedFixtureId || null,
    mentioned_fixture_ids: mentionedFixtureIds,
    teams_mentioned: teamsMentioned,
    line_locked: expectedLine,
    odds_locked: expectedOdds,
    urls,
    domains: urls.map(hostname).filter(Boolean),
    items,
    counters: countersFor(items),
    valid_for_reanalysis: Boolean(originalText) && !fixtureMismatch && !incompatibleDate,
    validation_errors: errors,
    warnings: [
      ...(urls.length ? [] : ["response_without_sources"]),
      ...(items.some((item) => item.kind === GEMINI_ITEM_KIND.RUMOR) ? ["rumors_present"] : []),
    ],
  };
}

export function selectGeminiItems(context, selectedIds = []) {
  const allowed = new Set(selectedIds);
  const items = (context?.items || []).map((item) => ({ ...item, selected: allowed.has(item.id) }));
  return {
    ...context,
    items,
    selected_items: (context?.items || []).filter((item) => allowed.has(item.id)),
    counters: countersFor(items),
  };
}
