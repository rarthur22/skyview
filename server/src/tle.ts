// Satellite TLE proxy: fetch current TLEs from Celestrak on demand, cache in
// memory with a short TTL. Optional — the core HUD does not require satellites;
// this lets clients (or a future sky layer) ask for them.

export interface Tle {
  name: string;
  line1: string;
  line2: string;
}

const SOURCES = [
  "stations",
  "visual",
  "active",
];

export class TleStore {
  private cache: Tle[] = [];
  private fetchedAt = 0;
  private ttlMs = 3600_000;

  constructor(private ttlMsOverride?: number) {
    if (this.ttlMsOverride) this.ttlMs = this.ttlMsOverride;
  }

  async get(): Promise<Tle[]> {
    if (Date.now() - this.fetchedAt < this.ttlMs && this.cache.length) return this.cache;
    await this.refresh();
    return this.cache;
  }

  private async refresh(): Promise<void> {
    const tles: Tle[] = [];
    for (const group of SOURCES) {
      try {
        const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;
        const text = await res.text();
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (let i = 0; i + 2 < lines.length; i += 3) {
          tles.push({ name: lines[i], line1: lines[i + 1], line2: lines[i + 2] });
        }
      } catch {
        /* offline — keep whatever we have */
      }
    }
    if (tles.length) {
      this.cache = tles;
      this.fetchedAt = Date.now();
    }
  }
}
