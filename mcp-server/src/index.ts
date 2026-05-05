#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { WebSocketBridge } from "./websocket.js";
import { WebSocketBridgeClient } from "./bridge.js";
import type { BridgeLike } from "./bridge.js";
import * as net from "net";

// Port on which the MCP bridge should listen/connect
const WS_PORT = parseInt(process.env.FIGMA_MCP_PORT ?? "3055", 10);

// Utility: test if a local TCP port is available
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const tester = net.createServer()
      .once("error", (err: any) => {
        // If in use or other error, port is not available
        tester.close();
        resolve(false);
      })
      .once("listening", () => {
        tester.close();
        resolve(true);
      })
      .listen(port, "127.0.0.1");
  });
}

(async () => {
  // Decide mode based on port availability
  const isPrimary = await isPortAvailable(WS_PORT);
  const bridge: BridgeLike = isPrimary
    ? new WebSocketBridge(WS_PORT)
    : new WebSocketBridgeClient(WS_PORT);

  if (isPrimary) {
    console.error(`[MCP] Starting in PRIMARY mode on port ${WS_PORT}`);
  } else {
    console.error(`[MCP] Starting in SECONDARY mode (forwarding to primary) on port ${WS_PORT}`);
  }

  const server = new McpServer({
    name: "figma-mcp",
    version: "1.0.0",
  });

  // Use the chosen bridge to register tools
  registerTools(server, bridge);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] Figma MCP server started");
})();
