// WebSocket lifecycle. Starts the data manager once, subscribes to state
// (connected / latency) and returns the live connection metrics.

import { useEffect, useState } from "react";
import { dataManager } from "../utils/data-processing.js";

export interface LiveMetrics {
  connected: boolean;
  latency: number;
  lastUpdate: number;
}

export function useWebSocket(): LiveMetrics {
  const [live, setLive] = useState<LiveMetrics>({
    connected: false,
    latency: 0,
    lastUpdate: 0,
  });

  useEffect(() => {
    dataManager.start();
    const sync = () =>
      setLive({
        connected: dataManager.connectedLive,
        latency: dataManager.avgLatencyMs,
        lastUpdate: dataManager.lastUpdateMs,
      });
    sync();
    const off = dataManager.subscribeState(sync);
    const iv = setInterval(sync, 1000);
    return () => {
      off();
      clearInterval(iv);
    };
  }, []);

  return live;
}
