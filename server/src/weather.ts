// Real weather from Open-Meteo (free, no API key). Cached in memory for the
// lifetime of the cache window so we don't hammer the endpoint each tick.

import type { WeatherData, WeatherCategory } from "@skyview/shared/index.js";

interface OpenMeteoCurrent {
  time?: string;
  temperature_2m?: number;
  relative_humidity_2m?: number;
  is_day?: number;
  precipitation?: number;
  weather_code?: number;
  cloud_cover?: number;
  wind_speed_10m?: number; // km/h
  wind_direction_10m?: number; // deg
  wind_gusts_10m?: number; // km/h
}

function categoryFor(code: number): { desc: string; category: WeatherCategory } {
  if (code === 0) return { desc: "Clear sky", category: "clear" };
  if (code <= 2) return { desc: "Partly cloudy", category: "cloudy" };
  if (code === 3) return { desc: "Overcast", category: "cloudy" };
  if (code === 45 || code === 48) return { desc: "Fog", category: "fog" };
  if (code >= 51 && code <= 57) return { desc: "Drizzle", category: "rain" };
  if (code >= 61 && code <= 67) return { desc: "Rain", category: "rain" };
  if (code >= 71 && code <= 77) return { desc: "Snow", category: "snow" };
  if (code >= 80 && code <= 82) return { desc: "Rain showers", category: "rain" };
  if (code === 85 || code === 86) return { desc: "Snow showers", category: "snow" };
  if (code >= 95) return { desc: "Thunderstorm", category: "storm" };
  return { desc: "Unknown", category: "cloudy" };
}

/** Fetch current conditions at a location from Open-Meteo (no key needed). */
export async function fetchWeather(url: string): Promise<WeatherData> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as { current?: OpenMeteoCurrent };
  const c = json.current ?? {};
  const code = c.weather_code ?? 0;
  const { desc, category } = categoryFor(code);
  return {
    temperature: c.temperature_2m ?? 0,
    windKt: (c.wind_speed_10m ?? 0) / 1.852,
    windDir: c.wind_direction_10m ?? 0,
    windGustKt: (c.wind_gusts_10m ?? 0) / 1.852,
    cloudCover: c.cloud_cover ?? 0,
    condition: desc,
    code,
    category,
    isDay: (c.is_day ?? 1) === 1,
    updatedAt: Date.now(),
  };
}

export function buildWeatherUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current:
      "temperature_2m,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

/** In-memory cached weather provider (updates at most every `ttlMs`). */
export function makeWeatherProvider(
  lat: () => number,
  lon: () => number,
  ttlMs = 5 * 60_000,
): () => WeatherData | null {
  let cached: WeatherData | null = null;
  let at = 0;
  let fetching = false;
  let lastKey = "";

  const refresh = async () => {
    const key = `${lat().toFixed(2)},${lon().toFixed(2)}`;
    if (key !== lastKey) {
      cached = null;
      at = 0;
      lastKey = key;
    }
    try {
      cached = await fetchWeather(buildWeatherUrl(lat(), lon()));
      at = Date.now();
    } catch {
      /* offline / rate-limited — keep previous value */
      if (!cached) at = Date.now() - ttlMs + 30_000; // retry sooner with no data
    }
  };

  void refresh();

  return () => {
    if (Date.now() - at > ttlMs && !fetching) {
      fetching = true;
      void refresh().finally(() => {
        fetching = false;
      });
    }
    return cached;
  };
}
