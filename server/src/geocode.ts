// Location resolution via Nominatim (OpenStreetMap). Never invents a fallback:
// a miss returns null, so the caller never silently relocates to 0,0.

export interface GeocodeHit {
  name: string;
  lat: number;
  lon: number;
  type: string;
  displayName: string;
}

export async function resolveLocation(
  q: string,
  opts: { userAgent: string },
): Promise<GeocodeHit | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=` +
    encodeURIComponent(q);
  const res = await fetch(url, {
    headers: { "User-Agent": opts.userAgent },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Array<{
    name?: string;
    lat?: string;
    lon?: string;
    type?: string;
    display_name?: string;
  }>;
  if (!Array.isArray(json) || json.length === 0) return null;
  const top = json[0];
  if (top.lat == null || top.lon == null) return null;
  return {
    name: top.name ?? top.display_name ?? q,
    lat: Number(top.lat),
    lon: Number(top.lon),
    type: top.type ?? "location",
    displayName: top.display_name ?? top.name ?? q,
  };
}

/** Parse a raw "lat,lon" string into a hit, or null. */
export function parseLatLon(q: string): GeocodeHit | null {
  const m = q.trim().match(/^([-+]?\d+(?:\.\d+)?)\s*,\s*([-+]?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon, type: "coordinate", displayName: `${lat}, ${lon}` };
}
