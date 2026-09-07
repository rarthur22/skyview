// Resolve the server REST base. When the SPA is served by the SkyView server,
// derive it from the page origin (works on any host/port); otherwise fall back
// to the default. `VITE_API_BASE` overrides.

export function getApiBase(): string {
  const env = import.meta.env.VITE_API_BASE;
  if (env) return env;
  if (typeof window !== "undefined" && window.location?.origin) return `${window.location.origin}/api`;
  return "http://localhost:3000/api";
}
