import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WebSocketBridge } from "./websocket.js";
import type { SerializedNode, SerializedPaint, SerializedStyle, SerializedVariable } from "./types.js";
import { formatNode, formatStyle, formatVariable, formatDesignBrief, formatColor, formatFills, formatFlows } from "./formatter.js";
import type { SerializedFlowData } from "./types.js";
import { truncateResponse } from "./truncator.js";

// Compact JSON — no pretty-printing. Saves ~40% tokens.
const J = (v: unknown) => JSON.stringify(v);

interface DevSummaryData {
  structure: SerializedNode;
  texts: Array<{
    name: string;
    characters: string;
    fontSize?: number | "mixed";
    fontName?: { family: string; style: string } | "mixed";
  }>;
  colors: Array<{ r: number; g: number; b: number; opacity?: number }>;
  components: Array<{ name: string; componentName: string; texts: string[] }>;
  screenshot: { base64: string; format: string; mimeType: string } | null;
}

export function registerTools(server: McpServer, bridge: WebSocketBridge): void {

  server.tool(
    "get_document_info",
    "File name, pages, current page.",
    {},
    async () => {
      const data = await bridge.request("get_document_info");
      return { content: [{ type: "text", text: J(data) }] };
    }
  );

  server.tool(
    "get_selection",
    "Selected nodes with CSS properties. Text always included. Options: flatten_text, include_screenshot.",
    {
      depth: z.number().min(0).max(5).optional().describe("Depth (default 1, max 5)"),
      flatten_text: z.boolean().optional().describe("Flat list of all text in subtree"),
      include_screenshot: z.boolean().optional().describe("Inline PNG thumbnail"),
      max_width: z.number().optional().describe("Screenshot max width px (default 800)"),
    },
    async ({ depth, flatten_text, include_screenshot, max_width }) => {
      const data = await bridge.request("get_selection", {
        depth: depth ?? 1,
        flatten_text: flatten_text ?? false,
        include_screenshot: include_screenshot ?? false,
        max_width: max_width ?? 800,
      }, 60_000) as Array<Record<string, unknown>>;
      if (!data?.length) {
        return { content: [{ type: "text", text: "No selection." }] };
      }
      return buildNodeResponse(data);
    }
  );

  server.tool(
    "get_node_by_id",
    "Node details by ID with CSS properties. Supports pagination for large children lists via childrenOffset/childrenLimit.",
    {
      nodeId: z.string().describe("Figma node ID"),
      depth: z.number().min(0).max(5).optional().describe("Depth (default 1, max 5)"),
      properties: z.array(z.enum(["layout", "colors", "typography", "spacing", "size", "children", "all"]))
        .optional().describe("Filter categories (default: all)"),
      flatten_text: z.boolean().optional().describe("Flat list of all text in subtree (capped at 500)"),
      include_screenshot: z.boolean().optional().describe("Inline PNG thumbnail"),
      max_width: z.number().optional().describe("Screenshot max width px (default 800)"),
      childrenOffset: z.number().min(0).optional().describe("Skip first N children (for pagination)"),
      childrenLimit: z.number().min(1).max(500).optional().describe("Max children to return (default 200)"),
    },
    async ({ nodeId, depth, properties, flatten_text, include_screenshot, max_width, childrenOffset, childrenLimit }) => {
      const data = await bridge.request("get_node_by_id", {
        nodeId,
        depth: depth ?? 1,
        properties: properties ?? ["all"],
        flatten_text: flatten_text ?? false,
        include_screenshot: include_screenshot ?? false,
        max_width: max_width ?? 800,
        childrenOffset,
        childrenLimit,
      }, 60_000) as Record<string, unknown>;
      return buildSingleNodeResponse(data);
    }
  );

  server.tool(
    "get_styles",
    "Local styles as CSS values.",
    {
      styleType: z.enum(["paint", "text", "effect", "grid"]).optional().describe("Filter by type"),
    },
    async ({ styleType }) => {
      const data = await bridge.request("get_styles", { styleType }) as SerializedStyle[];
      const formatted = data.map(formatStyle);
      return { content: [{ type: "text", text: J(truncateResponse(formatted)) }] };
    }
  );

  server.tool(
    "get_variables",
    "Design tokens/variables as CSS values.",
    {
      collection: z.string().optional().describe("Filter by collection"),
      type: z.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).optional().describe("Filter by type"),
    },
    async ({ collection, type }) => {
      const data = await bridge.request("get_variables", { collection, type }) as SerializedVariable[];
      const formatted = data.map(formatVariable);
      return { content: [{ type: "text", text: J(truncateResponse(formatted)) }] };
    }
  );

  server.tool(
    "get_components",
    "Local components with property definitions.",
    {
      name: z.string().optional().describe("Filter by name"),
    },
    async ({ name }) => {
      const data = await bridge.request("get_components", { name }) as unknown as SerializedNode[];
      const formatted = data.map(formatNode);
      return { content: [{ type: "text", text: J(truncateResponse(formatted)) }] };
    }
  );

  server.tool(
    "get_design_context",
    "Design brief for a node. Brief=markdown, detailed=JSON.",
    {
      nodeId: z.string().optional().describe("Node ID (default: selection)"),
      format: z.enum(["brief", "detailed"]).optional().describe("brief (default) or detailed"),
    },
    async ({ nodeId, format: formatArg }) => {
      const format = formatArg ?? "brief";
      const data = await bridge.request("get_design_context", { nodeId }) as {
        node: SerializedNode;
        children: SerializedNode[];
      };

      if (format === "brief") {
        const brief = formatDesignBrief(data.node, data.children);
        const CAP = 16000;
        if (brief.length <= CAP) {
          return { content: [{ type: "text", text: brief }] };
        }
        const truncated = brief.slice(0, CAP) + `\n\n_[truncated ${brief.length - CAP} chars. Use format="detailed" with get_node_by_id for full detail.]_`;
        return { content: [{ type: "text", text: truncated }] };
      }

      const formatted = { node: formatNode(data.node), children: data.children.map(formatNode) };
      return { content: [{ type: "text", text: J(truncateResponse(formatted)) }] };
    }
  );

  server.tool(
    "get_screenshot",
    "Export node as image.",
    {
      nodeId: z.string().describe("Node ID"),
      scale: z.number().min(0.1).max(4).optional().describe("Scale (default 1)"),
      format: z.enum(["PNG", "JPG", "SVG"]).optional().describe("Format (default PNG)"),
      max_width: z.number().optional().describe("Max width px (default 800)"),
    },
    async ({ nodeId, scale: scaleArg, format: formatArg, max_width }) => {
      const scale = scaleArg ?? 1;
      const format = formatArg ?? "PNG";
      const data = await bridge.request("get_screenshot", { nodeId, scale, format, max_width: max_width ?? 800 }, 60_000) as {
        base64: string;
        mimeType: string;
      };
      if (format === "SVG") {
        return { content: [{ type: "text", text: data.base64 }] };
      }
      return { content: [{ type: "image", data: data.base64, mimeType: `image/${format.toLowerCase()}` }] };
    }
  );

  server.tool(
    "get_dev_summary",
    "Complete design summary in one call: structure, all text, colors, components, screenshot. Use this first.",
    {
      nodeId: z.string().optional().describe("Node ID (default: selection)"),
      include_screenshot: z.boolean().optional().describe("Include PNG (default true)"),
      max_width: z.number().optional().describe("Max width px (default 800)"),
      depth: z.number().min(0).max(5).optional().describe("Structure tree depth (default 2, max 5)"),
    },
    async ({ nodeId, include_screenshot, max_width, depth }) => {
      const data = await bridge.request("get_dev_summary", {
        nodeId,
        include_screenshot: include_screenshot ?? true,
        max_width: max_width ?? 800,
        depth: depth ?? 2,
      }, 60_000) as DevSummaryData;

      const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [];

      // Compact text list
      const textLines = data.texts.map((t) => {
        const font = t.fontName && t.fontName !== "mixed" ? t.fontName.family : "";
        const size = t.fontSize && t.fontSize !== "mixed" ? `${t.fontSize}` : "";
        const meta = [font, size].filter(Boolean).join(" ");
        return meta ? `"${t.characters}" (${meta})` : `"${t.characters}"`;
      });

      // Compact color list
      const colorSet = new Set(data.colors.map((c) => formatColor(c, c.opacity)));

      // Compact component list — group by master component, show instance names if distinct
      const byComponent = new Map<string, { instances: Set<string>; texts: string[] }>();
      for (const comp of data.components) {
        const key = comp.componentName || comp.name;
        const entry = byComponent.get(key) ?? { instances: new Set(), texts: [] };
        if (comp.name !== key) entry.instances.add(comp.name);
        entry.texts.push(...comp.texts);
        byComponent.set(key, entry);
      }
      const compLines = [...byComponent.entries()].map(([componentName, entry]) => {
        const countSuffix = entry.instances.size > 1 ? ` x${entry.instances.size}` : "";
        const uniqueTexts = [...new Set(entry.texts)].map((t) => `"${t}"`).join(", ");
        return uniqueTexts ? `${componentName}${countSuffix}: ${uniqueTexts}` : `${componentName}${countSuffix}`;
      });

      // Build compact markdown
      const lines: string[] = [
        `# ${data.structure.name} (${data.structure.type})`,
        "",
        `## Structure`,
        J(truncateResponse(formatNode(data.structure), 1500)),
        "",
        `## Texts (${textLines.length})`,
        textLines.join("\n") || "None",
        "",
        `## Colors (${colorSet.size})`,
        [...colorSet].join(", "),
      ];

      if (compLines.length) {
        lines.push("", `## Components (${compLines.length})`, compLines.join("\n"));
      }

      content.push({ type: "text", text: lines.join("\n") });

      if (data.screenshot?.base64) {
        content.push({
          type: "image",
          data: data.screenshot.base64,
          mimeType: data.screenshot.mimeType || "image/png",
        });
      }

      return { content: content as Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> };
    }
  );

  server.tool(
    "get_flows",
    "Prototype flows and interactions. Shows starting points and all click/hover/press connections between frames. Useful for understanding navigation logic.",
    {
      nodeId: z.string().optional().describe("Scope to a subtree (default: entire current page)"),
      limit: z.number().min(1).max(1000).optional().describe("Max connections to return (default 200)"),
    },
    async ({ nodeId, limit }) => {
      const data = await bridge.request("get_flows", { nodeId }) as SerializedFlowData;
      // Cap connections to protect token budget
      const cap = limit ?? 200;
      const capped: SerializedFlowData = {
        startingPoints: data.startingPoints,
        connections: data.connections.slice(0, cap),
        totalConnections: data.totalConnections,
      };
      let formatted = formatFlows(capped);
      if (data.connections.length > cap) {
        formatted += `\n\n_Showing ${cap}/${data.connections.length} connections. Increase \`limit\` or scope via \`nodeId\` to see more._`;
      }
      return { content: [{ type: "text", text: formatted }] };
    }
  );
}

// ---- Helpers ----

function formatFlatTexts(flatTexts: unknown[]): Array<{ t: string; f?: string; c?: string }> {
  return flatTexts.map((item: unknown) => {
    const t = item as Record<string, unknown>;
    const fills = t.fills as SerializedPaint[] | undefined;
    const result: { t: string; f?: string; c?: string } = { t: String(t.characters || "") };
    if (t.fontName && t.fontName !== "mixed") {
      const fn = t.fontName as { family: string };
      const size = t.fontSize !== "mixed" ? ` ${t.fontSize}` : "";
      result.f = fn.family + size;
    }
    if (fills?.length) {
      const c = formatFills(fills);
      if (c) result.c = c;
    }
    return result;
  });
}

function buildSingleNodeResponse(data: Record<string, unknown>) {
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

  const { flatTexts, screenshot, ...nodeData } = data;
  const formatted = formatNode(nodeData as unknown as SerializedNode);

  const response: Record<string, unknown> = { ...formatted };
  if (flatTexts && Array.isArray(flatTexts)) {
    response.texts = formatFlatTexts(flatTexts);
  }

  content.push({ type: "text", text: J(truncateResponse(response)) });

  if (screenshot && typeof screenshot === "object" && (screenshot as Record<string, unknown>).base64) {
    const ss = screenshot as { base64: string; mimeType: string };
    content.push({ type: "image", data: ss.base64, mimeType: ss.mimeType || "image/png" });
  }

  return { content };
}

function buildNodeResponse(data: Array<Record<string, unknown>>) {
  const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [];

  const nodes = data.map((item) => {
    const { flatTexts, screenshot, ...nodeData } = item;
    const formatted = formatNode(nodeData as unknown as SerializedNode);
    const response: Record<string, unknown> = { ...formatted };

    if (flatTexts && Array.isArray(flatTexts)) {
      response.texts = formatFlatTexts(flatTexts);
    }

    if (screenshot && typeof screenshot === "object" && (screenshot as Record<string, unknown>).base64) {
      const ss = screenshot as { base64: string; mimeType: string };
      content.push({ type: "image", data: ss.base64, mimeType: ss.mimeType || "image/png" });
    }

    return response;
  });

  content.unshift({ type: "text", text: J(truncateResponse(nodes)) });
  return { content };
}
