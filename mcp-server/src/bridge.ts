import { WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { PluginRequest, PluginResponse } from "./types.js";

// BridgeLike interface declaration
export interface BridgeLike {
  isConnected(): boolean;
  request(type: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown>;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * WebSocketBridgeClient
 *
 * A lightweight client that forwards requests to a primary MCP instance
 * over a WebSocket. It mirrors the server-side WebSocketBridge protocol,
 * reusing PluginRequest/PluginResponse types from shared/types.ts.
 */
export class WebSocketBridgeClient implements BridgeLike {
  private ws: WebSocket | null = null;
  private port: number;
  private connected = false;
  private pending = new Map<string, PendingRequest>();
  private connectInProgress = false;

  constructor(port: number) {
    this.port = port;
    this.ensureConnection();
  }

  private get url(): string {
    // Connect to the primary's proxy port (port + 1), not the Figma plugin port
    return `ws://localhost:${this.port + 1}`;
  }

  // Attempt to establish a WebSocket connection to the primary instance
  private ensureConnection(): void {
    if (this.connectInProgress || this.isConnected()) return;
    this.connectInProgress = true;
    const ws = new WebSocket(this.url);
    this.ws = ws;

    let heartbeat: ReturnType<typeof setInterval> | null = null;

    ws.on("open", () => {
      this.connected = true;
      this.connectInProgress = false;
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.ping(); } catch { /* ignore */ }
        }
      }, 30_000);
    });

    ws.on("message", (raw: any) => {
      try {
        const resp = JSON.parse(raw.toString()) as PluginResponse;
        const pending = this.pending.get(resp.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(resp.id);
        if (resp.success) {
          pending.resolve(resp.data ?? undefined);
        } else {
          pending.reject(new Error(resp.error ?? "Plugin error"));
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      if (heartbeat !== null) { clearInterval(heartbeat); heartbeat = null; }
      this.connected = false;
      this.ws = null;
      for (const [id, pending] of this.pending) {
        clearTimeout(pending.timer);
        pending.reject(new Error("Primary disconnected"));
        this.pending.delete(id);
      }
      this.connectInProgress = false;
      setTimeout(() => this.ensureConnection(), 1000);
    });

    ws.on("error", (err) => {
      // Swallow, close will trigger retry logic
      // eslint-disable-next-line no-console
      console.error(`[MCP] WebSocketBridgeClient error: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  isConnected(): boolean {
    return this.ws !== null && (this.ws!.readyState === WebSocket.OPEN);
  }

  async request(type: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<unknown> {
    // Ensure we have a live connection before sending
    if (!this.isConnected()) {
      this.ensureConnection();
      // Wait briefly for connection to establish
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      if (!this.isConnected()) {
        throw new Error("WebSocketBridgeClient is not connected to primary");
      }
    }

    const id = randomUUID();
    const request: PluginRequest = {
      id,
      type: type as PluginRequest["type"],
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(request));
    });
  }
}

// End of bridge.ts
