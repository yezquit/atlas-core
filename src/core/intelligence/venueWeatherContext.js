import {
  WEATHER_STATUS,
  createVenueWeatherContext,
} from "../contracts/sportsIntelligenceContracts.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

export function buildVenueWeatherContext({
  fixture,
  venueDetails = null,
  weather = null,
  now = Date.now(),
}) {
  const kickoff = Date.parse(fixture?.date?.utc);
  const fetchedAt = Date.parse(weather?.fetchedAt);
  let weatherStatus = weather?.status || WEATHER_STATUS.UNAVAILABLE;
  if (
    weather &&
    Number.isFinite(fetchedAt) &&
    (now - fetchedAt > SIX_HOURS_MS ||
      (weatherStatus === WEATHER_STATUS.FORECAST && kickoff < now - SIX_HOURS_MS))
  ) {
    weatherStatus = WEATHER_STATUS.STALE;
  }

  const altitude = Number.isFinite(venueDetails?.altitude)
    ? venueDetails.altitude
    : null;
  const riskFlags = [];
  if (Number(weather?.rainIntensity) >= 7) riskFlags.push("heavy_rain");
  if (Number(weather?.windSpeed) >= 35 || Number(weather?.windGusts) >= 50) {
    riskFlags.push("strong_wind");
  }
  if (Number(weather?.temperature) >= 35) riskFlags.push("extreme_heat");
  if (Number(weather?.temperature) <= 5) riskFlags.push("extreme_cold");
  if (altitude !== null && altitude >= 1800) riskFlags.push("high_altitude");
  if (venueDetails?.surfaceStatus === "compromised") {
    riskFlags.push("compromised_surface");
  }

  const venueSource = fixture?.venue?.name ? "api-football:fixture" : null;
  return createVenueWeatherContext({
    venue: fixture?.venue?.name || venueDetails?.name || null,
    city: fixture?.venue?.city || venueDetails?.city || null,
    country: fixture?.competition?.country || venueDetails?.country || null,
    altitude,
    surface: venueDetails?.surface || null,
    localKickoffTime: fixture?.date?.utc || null,
    temperature: weather?.temperature,
    feelsLike: weather?.feelsLike,
    humidity: weather?.humidity,
    precipitation: weather?.precipitation,
    rainIntensity: weather?.rainIntensity,
    windSpeed: weather?.windSpeed,
    windGusts: weather?.windGusts,
    weatherStatus,
    source: weather?.source || venueSource,
    fetchedAt: weather?.fetchedAt || null,
    warnings: [
      ...(!weather ? ["No existe una fuente meteorológica conectada en esta fase."] : []),
      ...(weatherStatus === WEATHER_STATUS.STALE
        ? ["La información meteorológica ya no es temporalmente válida."]
        : []),
      ...(!venueDetails?.surface ? ["Superficie no disponible."] : []),
      ...(altitude === null ? ["Altitud no disponible."] : []),
    ],
    riskFlags,
    sourceRefs: [
      ...(fixture?.fixtureId ? [`fixture:${fixture.fixtureId}`] : []),
      ...(venueDetails?.sourceRef ? [venueDetails.sourceRef] : []),
      ...(weather?.sourceRef ? [weather.sourceRef] : []),
    ],
  });
}

export function createFutureWeatherAdapter() {
  return {
    async load() {
      return {
        status: WEATHER_STATUS.UNAVAILABLE,
        message: "Adaptador meteorológico no configurado.",
        data: null,
      };
    },
  };
}
