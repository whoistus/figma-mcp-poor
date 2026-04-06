# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Figma MCP (Model Context Protocol) bridge that lets AI assistants read design context from Figma without hitting REST API rate limits or blowing up context windows. It uses the Figma Plugin API (local, no network) instead of the REST API.

```
AI IDE  <--MCP stdio-->  MCP Server (Node.js :3055)  <--WebSocket-->  Figma Plugin (figma.* API)
```

## Build Commands

```bash
# Install dependencies (npm workspaces)
npm install

# Build everything
npm run build

# Build individually
npm run build:server    # tsc -> mcp-server/dist/
npm run build:plugin    # esbuild via build.mjs -> figma-plugin/dist/

# Dev mode (MCP server with tsx)
npm run dev:server

# Watch mode (Figma plugin)
npm run watch -w figma-plugin
```

The MCP server is an ES module (`"type": "module"`). The Figma plugin is bundled with esbuild.

## Architecture

**Two workspaces** in an npm workspaces monorepo:

### `mcp-server/` — Node.js MCP server
- `src/index.ts` — Entry point: wires McpServer + StdioServerTransport + WebSocketBridge
- `src/server.ts` — Registers 9 MCP tools with zod schemas, handles formatting/truncation of responses
- `src/websocket.ts` — WebSocketBridge class: single-connection WS server on port 3055, request/response matched by UUID
- `src/formatter.ts` — Transforms raw Figma data into CSS-like developer format (colors→hex/rgba, layout→flexbox, text→CSS font shorthand)
- `src/truncator.ts` — Token estimation (JSON length / 4) and smart truncation with configurable max (default 8000 tokens)
- `src/types.ts` — Re-exports from shared types

### `figma-plugin/` — Figma plugin (runs inside Figma)
- `src/main.ts` — Plugin main thread: shows UI, routes WS messages to handlers
- `src/ui.html` — WebSocket client that relays messages between WS and plugin main thread
- `src/serializer.ts` — Depth-controlled node serialization (depth 0 = stub, depth N = full properties + children). Applies automatic depth bonus for COMPONENT_SET (+2) and INSTANCE (+1) so variant hierarchies (e.g. dropdowns) aren't flattened at default depth.
- `src/base64.ts` — Pure base64 encoder for the plugin main thread (no `btoa` available). Screenshots are encoded here, not in the UI thread.
- `src/handlers/` — One handler per tool type (document, selection, node, styles, variables, components, context, screenshot, dev-summary)

### `shared/types.ts` — Protocol types
Defines `PluginRequest`/`PluginResponse` (WS protocol), `ToolType` union, per-tool param interfaces, `SerializedNode`, and paint/style/variable types. Used by both workspaces.

## Key Design Decisions

- **Formatting happens server-side, not in plugin** — Plugin sends raw serialized Figma data; the server transforms it to developer-friendly CSS-like output. This means formatting changes don't require rebuilding/reloading the plugin.
- **Default depth=1 for node traversal** — Prevents context explosion. AI explores incrementally via `get_node_by_id`. COMPONENT_SET and INSTANCE nodes get automatic depth bonuses (+2 and +1 respectively) so variant hierarchies (dropdowns, component sets) are preserved without requiring callers to increase depth.
- **Screenshots encoded in plugin main thread** — The plugin's `base64.ts` encodes export bytes directly, avoiding the old `_rawBytes` JSON array round-trip through the UI thread (which caused timeouts on large images). All screenshot handlers cap output via `max_width` (default 800px).
- **Truncation with hints** — When responses exceed token budget, children are truncated with `{ _truncated: true, remaining: N, hint: "..." }` to guide the AI to drill deeper.
- **WebSocket port** configurable via `FIGMA_MCP_PORT` env var (default 3055). Plugin hardcoded to `ws://localhost:3055` in `manifest.json` devAllowedDomains.

## MCP Tools (9 total)

Tiered by token cost: `get_document_info` and `get_selection` are lightweight discovery tools. `get_node_by_id`, `get_styles`, `get_variables`, `get_components` are targeted inspection. `get_design_context`, `get_screenshot`, and `get_dev_summary` are rich context tools. `get_dev_summary` is the recommended first call — returns structure, texts, colors, components, and screenshot in one request.
