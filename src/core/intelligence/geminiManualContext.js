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
    const urls = extractUrls(content);
    items.push({
      id: `gemini-${items.length + 1}`,
      kind: currentKind,
      text: content,
      urls,
      domains: urls.map(hostname).filter(Boolean),
      source_classifications: urls.map((url) => classifySource(url, sourceOptions)),
      publication_dates: content.match(/\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]20\d{2})\b/g) || [],
      verification_status: urls.length ? "user_reported" : "unverified",
      selected: currentKind !== GEMINI_ITEM_KIND.RUMOR,
    });
  }
  const urls = extractUrls(originalText);
  const mentionedFixtureIds = [...originalText.matchAll(/fixture(?:\s+id)?\s*[:#-]?\s*(\d+)/gi)].map((match) => Number(match[1]));
  const expectedFixtureId = Number(fixture?.fixtureId);
  const fixtureMismatch = mentionedFixtureIds.some((id) => id !== expectedFixtureId);
  const home = fixture?.teams?.home?.name || "";
  const away = fixture?.teams?.away?.name || "";
  const normalizedText = normalize(originalText);
  const teamsMentioned = [home, away].filter((team) => team && normalizedText.includes(normalize(team)));
  const incompatibleDate = (originalText.match(/\b20\d{2}-\d{2}-\d{2}\b/g) || []).some(
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
  return {
    ...context,
    items: (context?.items || []).map((item) => ({ ...item, selected: allowed.has(item.id) })),
    selected_items: (context?.items || []).filter((item) => allowed.has(item.id)),
  };
}
