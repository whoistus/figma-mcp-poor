# figma-mcp-poor

[![npm version](https://img.shields.io/npm/v/figma-mcp-poor.svg)](https://www.npmjs.com/package/figma-mcp-poor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Figma MCP (Model Context Protocol) bridge that lets AI assistants read design context from Figma. Uses the **Figma Plugin API** (local, no network) instead of the REST API — no API keys, no rate limits, no blown context windows.

```
AI IDE  ←—MCP stdio—→  MCP Server (Node.js)  ←—WebSocket—→  Figma Plugin (figma.* API)
```

## Quick Start

### 1. Set up your MCP client

Add the server to your MCP client config (see [Client Configuration](#mcp-client-configuration) below).

### 2. Install the Figma plugin

**Option A — Download pre-built (recommended):**

1. Go to [Releases](https://github.com/whoistus/figma-mcp-poor/releases/latest) and download `figma-plugin-vX.Y.Z.zip`
2. Unzip somewhere stable on your disk
3. In Figma: open any design file → **Plugins → Development → Import plugin from manifest...** → select `manifest.json` from the unzipped folder

**Option B — Build from source:**

```bash
git clone https://github.com/whoistus/figma-mcp-poor
cd figma-mcp-poor
npm install
npm run build:plugin
```

Then in Figma: **Plugins → Development → Import plugin from manifest...** → select `figma-plugin/manifest.json`.

Run the plugin — it will connect to the MCP server via WebSocket on `localhost:3055`.

### 3. Start designing with AI

Select elements in Figma and use your AI assistant to inspect them. The recommended first call is `get_dev_summary` — it returns structure, text content, colors, components, and a screenshot in one request.

## MCP Client Configuration

### Claude Code

In your project's `.mcp.json` or global `~/.claude.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-mcp-poor"]
    }
  }
}
```

### Cursor

In `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-mcp-poor"]
    }
  }
}
```

### VS Code (Copilot)

In `.vscode/mcp.json`:

```json
{
  "servers": {
    "figma": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "figma-mcp-poor"]
    }
  }
}
```

### Windsurf

In `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-mcp-poor"]
    }
  }
}
```

### Custom port

Set the `FIGMA_MCP_PORT` environment variable to change the WebSocket port (default: `3055`):

```json
{
  "mcpServers": {
    "figma": {
      "command": "npx",
      "args": ["-y", "figma-mcp-poor"],
      "env": {
        "FIGMA_MCP_PORT": "4000"
      }
    }
  }
}
```

> **Note:** If you change the port, you also need to update the Figma plugin's `manifest.json` → `networkAccess.devAllowedDomains` to match.

## Available Tools

| Tool                 | Description                                                                        | Token Cost |
| -------------------- | ---------------------------------------------------------------------------------- | ---------- |
| `get_dev_summary`    | **Start here.** Complete summary: structure, texts, colors, components, screenshot | Medium     |
| `get_document_info`  | File name, pages, current page                                                     | Low        |
| `get_selection`      | Selected nodes with CSS properties, optional text flattening and screenshot        | Low–Medium |
| `get_node_by_id`     | Inspect a specific node by ID with CSS properties. Paginates large children lists   | Low–Medium |
| `get_styles`         | Local paint/text/effect/grid styles as CSS values                                  | Low        |
| `get_variables`      | Design tokens/variables (colors, numbers, strings, booleans)                       | Low        |
| `get_components`     | Local components with property definitions                                         | Low–Medium |
| `get_design_context` | Design brief (markdown) or detailed context (JSON) for a node                      | Medium     |
| `get_flows`          | Prototype flows: starting points, interactions, navigation connections              | Low–Medium |
| `get_screenshot`     | Export a node as PNG, JPG, or SVG                                                  | Medium     |

## How It Works

1. The **MCP server** starts a WebSocket server on `localhost:3055`
2. The **Figma plugin** connects to this WebSocket from inside Figma
3. When an AI tool is called, the server sends a request through WebSocket to the plugin
4. The plugin reads data using the Figma Plugin API (`figma.*`) and sends it back
5. The server formats raw Figma data into developer-friendly CSS-like output and returns it to the AI

Key design decisions:

- **Default depth=1** for node traversal prevents context explosion. Use `get_node_by_id` to drill deeper.
- **Formatting is server-side** — the plugin sends raw data, the server transforms it. Formatting changes don't require reloading the plugin.
- **Smart truncation** — responses exceeding the token budget are truncated with hints guiding the AI to drill deeper.

## Development

```bash
# Install dependencies
npm install

# Build everything
npm run build

# Dev mode (MCP server with auto-reload)
npm run dev:server

# Watch mode (Figma plugin)
npm run watch -w figma-plugin
```

## Troubleshooting

**Plugin won't connect**

- Make sure the MCP server is running before starting the plugin
- Check that port 3055 (or your custom port) isn't in use: `lsof -i :3055`
- The plugin only connects to `localhost` — no remote connections

**"No selection" responses**

- Select at least one element in Figma before calling selection-based tools
- Make sure the plugin UI is open (the WebSocket client runs in the plugin UI)

**WebSocket errors**

- Only one Figma file can connect at a time (single-connection design)
- If you switch files, restart the plugin in the new file

**Large designs timing out**

- Use `get_node_by_id` with specific node IDs instead of scanning entire pages
- Reduce `depth` parameter (default is 1, max is 5)
- Screenshots are capped at 800px width by default — use `max_width` to adjust

## Changelog

### 0.1.0 (2026-04-15)

- Initial public release
- 9 MCP tools: `get_dev_summary`, `get_document_info`, `get_selection`, `get_node_by_id`, `get_styles`, `get_variables`, `get_components`, `get_design_context`, `get_screenshot`
- CSS-like formatting for colors, typography, layout (flexbox), spacing
- Smart truncation with drill-deeper hints
- Depth-controlled serialization with auto depth bonus for COMPONENT_SET (+2) and INSTANCE (+1)
- Screenshot export with configurable max width
- Text flattening and color collection utilities

### 0.2.0 (2026-04-15)

- **New tool: `get_flows`** — prototype flow support
  - Returns flow starting points (`page.flowStartingPoints`)
  - Collects all prototype connections from node trees
  - Supports all trigger types (click, hover, press, drag, mouse enter/leave, timeout)
  - Supports all action types (navigate, swap overlay, open URL, back, close, set variable)
  - Includes transition animations (dissolve, smart animate, slide, push, etc.) with duration and easing
- **Node-level reactions** — every serialized node now includes `reactions[]` when it has prototype interactions, visible in `get_node_by_id`, `get_selection`, and other node tools
- Compact arrow format for interactions: `Button --click--> Login Screen (smart-animate 300ms)`

### 0.3.0 (2026-04-15)

Fixes for fetching large design areas with minimal data loss.

- **Pagination on `get_node_by_id`** — new `childrenOffset` and `childrenLimit` params let AI fetch children in chunks for large frames. Response includes `pagination: { offset, limit, total, hasMore }`.
- **Raised children cap** — `MAX_CHILDREN` bumped from **100 → 200** per node. Fewer silent truncations on real-world designs.
- **Fixed `componentName` bug** — `get_dev_summary` previously reported the instance's node name as the component name. Now correctly resolves the master component name via `getMainComponentAsync()`. Renamed instances now group properly: `PrimaryButton x5: "Save", "Cancel", ...`.
- **Colors inside instances** — `get_dev_summary.colors` now walks into instances for fill colors (previously missed custom fill overrides).
- **Configurable `depth` on `get_dev_summary`** — was hardcoded to 2, now accepts `depth` param (default 2, max 5) for deeply nested screens.
- **Cap on `flatten_text`** — 500-entry default cap prevents token budget blow-ups on text-heavy pages.
- **Cap on `get_flows`** — new `limit` param (default 200, max 1000) with clear truncation hint in output.
- **`get_design_context` brief truncation signal** — 16000-char cap now includes an explicit hint instead of silently cutting mid-content.

## License

MIT
