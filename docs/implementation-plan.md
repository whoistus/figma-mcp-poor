# Figma MCP Plugin - Implementation Plan (Context-Optimized)

## Context

Building a Figma MCP bridge that lets AI assistants read design context from Figma **without hitting REST API rate limits AND without blowing up the AI's context window**. 

Two problems to solve:
1. **Rate limits** -> Use Figma Plugin API (local, no network) instead of REST API
2. **Context length overflow** -> Smart filtering, summarization, pagination, and developer-focused output

```
AI IDE  <--MCP stdio-->  Local MCP Server (Node.js)  <--WebSocket-->  Figma Plugin
                              :3055                         (figma.* API)
```

## Context Optimization Strategy (Core Differentiator)

### Problem
Other Figma MCP tools dump raw Figma node trees into AI context. A single frame can produce 10K+ tokens. A page with 50 frames = 500K+ tokens = unusable.

### Solution: 5 Strategies

**1. Developer-Focused Output Format**
- Don't return raw Figma data. Transform into CSS-like developer properties.
- Instead of: `{ fills: [{ type: "SOLID", color: { r: 0.2, g: 0.4, b: 1 }, opacity: 0.8 }] }`
- Return: `{ background: "rgba(51, 102, 255, 0.8)" }`
- Map auto-layout to flexbox terms (`display: flex`, `gap: 8px`, `padding: 16px`)
- Map text styles to CSS (`font: 500 16px/24px Inter`)

**2. Hierarchical Exploration (Lazy Loading)**
- Never dump the full tree. Start with a shallow overview, let AI drill down.
- `get_document_info` -> page/frame names only (tiny)
- `get_selection` / `get_node_by_id` -> 1-level children (id + name + type only)
- AI requests specific child nodes as needed
- Default depth = 1, configurable via `depth` param (max 3)

**3. Property Filtering**
- Each tool accepts an optional `properties` filter array
- Example: `get_node_by_id({ nodeId: "123", properties: ["layout", "colors"] })`
- Categories: `layout`, `colors`, `typography`, `spacing`, `size`, `children`, `all`
- Default: return only the most useful subset, not everything

**4. Response Size Limits**
- Server-side token estimation before returning to AI
- Hard cap: ~4000 tokens per response (configurable)
- If response exceeds cap: truncate children list + add `"truncated": true, "totalChildren": 150, "hint": "Use get_node_by_id to explore specific children"`
- Smart truncation: keep first N children, summarize the rest

**5. Summary Mode for Large Structures**
- `get_design_context` returns a **developer brief**, not raw data:
  ```
  ## Button Component
  - Layout: Row, gap 8px, padding 12px 24px
  - Background: #3366FF (alias: primary-500)
  - Text: "Submit" - Inter 500 16px/24px, #FFFFFF
  - Border: 1px solid #2952CC, radius 8px
  - States: hover, disabled (via variants)
  ```
- Structured for developer consumption, not Figma internals

## Project Structure

```
figma-mcp-poor/
├── package.json              # npm workspaces root
├── tsconfig.base.json
├── shared/
│   └── types.ts              # Protocol types
├── mcp-server/
│   ├── package.json          # @modelcontextprotocol/sdk, ws, zod
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # Entry: start MCP + WebSocket
│       ├── server.ts         # Register MCP tools
│       ├── websocket.ts      # WebSocket bridge
│       ├── formatter.ts      # Transform Figma data -> developer format
│       └── truncator.ts      # Token estimation + smart truncation
├── figma-plugin/
│   ├── package.json          # @figma/plugin-typings, esbuild
│   ├── tsconfig.json
│   ├── manifest.json
│   └── src/
│       ├── main.ts           # Plugin main thread
│       ├── ui.html           # WebSocket client + relay
│       ├── serializer.ts     # Node -> clean JSON (depth-controlled)
│       └── handlers/
│           ├── document.ts
│           ├── selection.ts
│           ├── node.ts
│           ├── styles.ts
│           ├── variables.ts
│           ├── components.ts
│           ├── context.ts    # The "smart summary" tool
│           └── screenshot.ts
```

## MCP Tools (Context-Aware Design)

### Tier 1: Lightweight Discovery (< 500 tokens each)
| Tool | Input | Output |
|------|-------|--------|
| `get_document_info` | none | File name, pages list, current page |
| `get_selection` | `depth?=1` | Selected nodes: id, name, type, size. Children as stubs |

### Tier 2: Targeted Inspection (< 2000 tokens each)
| Tool | Input | Output |
|------|-------|--------|
| `get_node_by_id` | `nodeId, depth?=1, properties?` | Node details in dev format, filtered by properties |
| `get_styles` | `styleType?` | Styles as CSS values |
| `get_variables` | `collection?, type?` | Variables grouped by collection, values as CSS |
| `get_components` | `name?` | Components with property defs, filterable by name |

### Tier 3: Rich Context (< 4000 tokens, summarized)
| Tool | Input | Output |
|------|-------|--------|
| `get_design_context` | `nodeId?, format?="brief"` | Developer brief: layout, colors, typography, spacing |
| `get_screenshot` | `nodeId, scale?=1, format?="PNG"` | Base64 image (visual, doesn't consume text tokens much) |

### Tool Parameter Details

**`get_node_by_id`**:
- `nodeId: string` (required)
- `depth: number` (default 1, max 3) -- how deep to traverse children
- `properties: string[]` (optional) -- filter: `["layout", "colors", "typography", "spacing", "size", "children"]`
- Returns dev-formatted properties, children as `{ id, name, type }` stubs at depth boundary

**`get_design_context`** (the key tool):
- `nodeId: string` (optional, defaults to selection)
- `format: "brief" | "detailed"` (default "brief")
- Brief mode returns a markdown-like developer summary (~500 tokens)
- Detailed mode returns structured JSON with all properties (~2000 tokens)
- Auto-resolves variable aliases to show both token name and value

**`get_styles`**:
- Returns styles in CSS format: `{ "Primary/Blue": "background: #3366FF", "Body": "font: 400 16px/24px Inter" }`
- Groups by type, deduplicates similar values

**`get_variables`**:
- `collection: string` (optional filter)
- `type: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN"` (optional filter)
- Returns: `{ "colors/primary-500": "#3366FF", "spacing/md": "16px" }` -- flat, dev-ready

## Implementation Steps

### Step 1: Project Scaffolding
- Root `package.json` (workspaces: `["mcp-server", "figma-plugin"]`)
- `tsconfig.base.json` (strict, ES2022)
- Both sub-package configs
- `manifest.json` with `devAllowedDomains: ["ws://localhost:3055"]`
- `npm install`

### Step 2: Shared Types (`shared/types.ts`)
- `PluginRequest { id, type, params }`
- `PluginResponse { id, success, data?, error? }`
- Tool type union, per-tool param interfaces

### Step 3: MCP Server - WebSocket Bridge
- `WebSocketBridge` class: single connection, request/response by ID
- Timeout: 30s default, 60s for screenshots
- Clear error messages when plugin not connected

### Step 4: MCP Server - Formatter (`formatter.ts`)
**This is the context-optimization layer.** Transform raw Figma data into dev-friendly output:
- `formatColor({r,g,b}, opacity)` -> `"rgba(51, 102, 255, 0.8)"` or `"#3366FF"`
- `formatFills(fills)` -> `"background: linear-gradient(...)"`  
- `formatTextStyle(node)` -> `"font: 500 16px/24px Inter"`
- `formatLayout(node)` -> `{ display: "flex", direction: "row", gap: "8px", padding: "16px" }`
- `formatSpacing(node)` -> `{ padding: "12px 24px", gap: "8px" }`
- `formatSize(node)` -> `{ width: "200px", height: "48px" }` or `{ width: "fill", height: "hug" }`

### Step 5: MCP Server - Truncator (`truncator.ts`)
- `estimateTokens(obj)` -- rough estimate (JSON string length / 4)
- `truncateResponse(data, maxTokens)` -- smart truncation:
  - If array of children: keep first N, add `{ _truncated: true, remaining: X, hint: "..." }`
  - If nested objects: reduce depth
  - Always preserve the top-level structure

### Step 6: MCP Server - Tool Registration (`server.ts`)
- Register all 8 tools with zod schemas
- Each handler: call bridge -> format response -> truncate if needed -> return

### Step 7: MCP Server - Entry Point (`index.ts`)
- Wire McpServer + StdioServerTransport + WebSocketBridge

### Step 8: Figma Plugin - Node Serializer (`serializer.ts`)
- `serializeNode(node, depth, properties?)` -- the plugin-side extraction
- Depth-controlled: at depth 0, return `{ id, name, type }` stub only
- Property-filtered: only extract requested categories
- Handles all node types (Frame, Text, Instance, Component, etc.)
- **Does NOT format** -- sends clean structured data, formatting happens server-side

### Step 9: Figma Plugin - UI (`ui.html`)
- WebSocket client to `ws://localhost:3055`
- Message relay between WS and main thread
- Base64 encoding for screenshots
- Auto-reconnect, status display

### Step 10: Figma Plugin - Handlers
- Each handler: read figma data -> serialize with depth/filter -> return
- `context.ts` handler extracts: colors used, text styles, layout props, spacing, component info
- All use async API variants (`getNodeByIdAsync`, `getLocalPaintStylesAsync`, etc.)

### Step 11: Figma Plugin - Main Thread (`main.ts`)
- Show UI, route messages to handlers, relay responses

### Step 12: Build & Test
- Server: `tsc` compile
- Plugin: `esbuild` bundle -> `dist/main.js` + copy `ui.html`

## Key Architecture Decisions

### Why format on the server, not the plugin?
- Plugin should be thin -- just read and serialize raw Figma data
- Server handles formatting, truncation, and context optimization
- Easier to iterate on output format without rebuilding plugin
- Server can estimate tokens and truncate before sending to AI

### Why depth=1 default?
- Most useful pattern: AI asks for selection, sees top-level structure, then drills into specific nodes
- Prevents accidental context explosion from deeply nested component trees
- AI can always request `depth: 2` or `depth: 3` when needed

### Why developer-format output?
- AI's job is to help developers. CSS-like values are directly actionable.
- Raw Figma data requires interpretation (0-1 color ranges, internal enums, etc.)
- Dramatically reduces tokens: `{ background: "#3366FF" }` vs full Figma paint object

## Verification
1. `npx @modelcontextprotocol/inspector` -- verify 8 tools, check response sizes
2. Import plugin in Figma -> verify WebSocket connects
3. Call `get_selection` on a complex frame -> verify response is < 2000 tokens
4. Call `get_design_context` on a component -> verify developer brief format
5. Call `get_node_by_id` with depth=3 on a large frame -> verify truncation works
6. End-to-end: add to Claude Code MCP config, ask "describe the selected component's design"
7. **Context budget test**: Use all tools in a single conversation, verify total context stays manageable
