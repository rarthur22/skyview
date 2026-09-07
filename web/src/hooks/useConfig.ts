// Live config from the server payload (updates ~1Hz), with display preferences
// layered from the UI store (persisted to localStorage). Provides setters that
// mirror changes back to the server for displayMode.

import { useEffect, useState } from "react";
import type { Config } from "@skyview/shared/index.js";
import { dataManager } from "../utils/data-processing.js";
import { defaultConfig } from "../config.js";
import { getApiBase } from "../utils/api.js";
import { useUI, type DisplayPrefs } from "../store.js";

const API_BASE = getApiBase();

export interface ConfigState {
  config: Config;
  prefs: DisplayPrefs;
  setPrefs: (p: Partial<DisplayPrefs>) => void;
  updateServerConfig: (patch: Partial<Config>) => Promise<Config>;
}

export function useConfig(): ConfigState {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const prefs = useUI((s) => s.prefs);
  const setPrefs = useUI((s) => s.setPrefs);

  useEffect(() => {
    return dataManager.subscribe((p) => {
      if (p.config) setConfig(p.config);
    });
  }, []);

  // Keep server in sync when the display mode changes locally.
  useEffect(() => {
    void fetch(`${API_BASE}/aircraft-display`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayMode: prefs.displayMode }),
    }).catch(() => {
      /* server may be down; local pref still applies */
    });
  }, [prefs.displayMode]);

  const updateServerConfig = async (patch: Partial<Config>): Promise<Config> => {
    const res = await fetch(`${API_BASE}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`config update failed: ${res.status}`);
    const next = (await res.json()) as Config;
    setConfig(next);
    return next;
  };

  return { config, prefs, setPrefs, updateServerConfig };
}
