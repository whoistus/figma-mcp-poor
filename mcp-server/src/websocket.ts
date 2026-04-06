import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import type { PluginRequest, PluginResponse } from "./types.js";

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WebSocketBridge {
  private wss: WebSocketServer;
  private socket: WebSocket | null = null;
  private pending = new Map<string, PendingRequest>();

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws) => {
      // Only allow one plugin connection at a time
      if (this.socket) {
        this.socket.close();
      }
      this.socket = ws;
      console.error(`[MCP] Figma plugin connected`);

      ws.on("message", (raw) => {
        try {
          const response = JSON.parse(raw.toString()) as PluginResponse;
          const pending = this.pending.get(response.id);
          if (!pending) return;

          clearTimeout(pending.timer);
          this.pending.delete(response.id);

          if (response.success) {
            pending.resolve(response.data);
          } else {
            pending.reject(new Error(response.error ?? "Plugin returned an error"));
          }
        } catch {
          // ignore malformed messages
        }
      });

      ws.on("close", () => {
        if (this.socket === ws) {
          this.socket = null;
          console.error(`[MCP] Figma plugin disconnected`);
          // Reject all pending requests
          for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error("Plugin disconnected"));
            this.pending.delete(id);
          }
        }
      });

      ws.on("pong", () => {
        // connection is alive
      });
    });

    // Heartbeat every 30s
    setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.ping();
      }
    }, 30_000);

    console.error(`[MCP] WebSocket server listening on port ${port}`);
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  async request(type: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<unknown> {
    if (!this.isConnected()) {
      throw new Error(
        "Figma plugin is not connected. Please open Figma and run the MCP Bridge plugin."
      );
    }

    const id = randomUUID();
    const request: PluginRequest = {
      id,
      type: type as PluginRequest["type"],
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.socket!.send(JSON.stringify(request));
    });
  }
}
