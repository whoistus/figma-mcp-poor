#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./server.js";
import { WebSocketBridge } from "./websocket.js";

const WS_PORT = parseInt(process.env.FIGMA_MCP_PORT ?? "3055", 10);

const bridge = new WebSocketBridge(WS_PORT);
const server = new McpServer({
  name: "figma-mcp",
  version: "1.0.0",
});

registerTools(server, bridge);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[MCP] Figma MCP server started");
