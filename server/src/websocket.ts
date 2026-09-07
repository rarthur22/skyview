// WebSocket hub. Every connected client receives the full SkyView payload
// (aircraft + sky + config + status). The server composes it here so the client
// needs zero extra bookkeeping.

import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type {
  Aircraft,
  Config,
  SkyData,
  SourceStatus,
  WeatherData,
  WebSocketPayload,
} from "@skyview/shared/index.js";

export interface HubDeps {
  getConfig: () => Config;
  getStatus: () => SourceStatus;
  getSky: () => SkyData;
  getWeather?: () => WeatherData | null;
  isOriginAllowed: (origin: string | null) => boolean;
}

export class Hub {
  private wss: WebSocketServer;
  private clients = new Set<WebSocket>();
  private aircraft: Aircraft[] = [];
  private now = Date.now();

  constructor(server: Server, private deps: HubDeps) {
    this.wss = new WebSocketServer({ server, path: "/ws" });
    this.wss.on("connection", (ws, req) => {
      const origin = req.headers.origin ?? null;
      if (!this.deps.isOriginAllowed(origin)) {
        ws.close(1008, "origin not allowed");
        return;
      }
      this.clients.add(ws);
      // Send a first payload immediately so the UI isn't blank on connect.
      this.sendTo(ws);
      ws.on("close", () => this.clients.delete(ws));
      ws.on("error", () => this.clients.delete(ws));
    });
  }

  setAircraft(now: number, aircraft: Aircraft[]): void {
    this.aircraft = aircraft;
    this.now = now;
    this.broadcast();
  }

  broadcast(): void {
    for (const ws of this.clients) this.sendTo(ws);
  }

  close(): void {
    this.wss.close();
  }

  private sendTo(ws: WebSocket): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    const payload: WebSocketPayload = {
      aircraft: this.aircraft,
      sky: this.deps.getSky(),
      config: this.deps.getConfig(),
      status: this.deps.getStatus(),
      weather: this.deps.getWeather?.() ?? undefined,      now: this.now,
    };
    ws.send(JSON.stringify(payload));
  }
}
