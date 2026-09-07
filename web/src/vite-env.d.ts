/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_API_BASE?: string;
  readonly VITE_DEFAULT_LAT?: string;
  readonly VITE_DEFAULT_LON?: string;
  readonly VITE_DEFAULT_RADIUS?: string;
  readonly VITE_AIRCRAFT_MODEL?: "glyphs" | "glb" | "mesh";
  readonly VITE_LOG_LEVEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
