import { serializeNode } from "../serializer";
import { uint8ToBase64 } from "../base64";

interface TextEntry {
  name: string;
  characters: string;
  fontSize?: number | "mixed";
  fontName?: { family: string; style: string } | "mixed";
}

interface ColorEntry {
  r: number;
  g: number;
  b: number;
  opacity?: number;
}

interface ComponentEntry {
  name: string;
  texts: string[];
}

export async function handleGetDevSummary(params: {
  nodeId?: string;
  include_screenshot?: boolean;
  max_width?: number;
}) {
  let targetNode: SceneNode;

  if (params.nodeId) {
    const node = await figma.getNodeByIdAsync(params.nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
      throw new Error(`Invalid node: ${params.nodeId}`);
    }
    targetNode = node as SceneNode;
  } else {
    const selection = figma.currentPage.selection;
    if (!selection.length) {
      throw new Error("No node selected and no nodeId provided");
    }
    targetNode = selection[0];
  }

  // Single tree walk: collect texts, colors, components all at once
  const texts: TextEntry[] = [];
  const colorSet = new Set<string>();
  const colors: ColorEntry[] = [];
  const components: ComponentEntry[] = [];

  function walk(n: SceneNode): void {
    // Collect text
    if (n.type === "TEXT") {
      const t = n as TextNode;
      const entry: TextEntry = { name: n.name, characters: t.characters };
      if (t.fontSize !== figma.mixed) entry.fontSize = t.fontSize;
      if (t.fontName !== figma.mixed) entry.fontName = { family: t.fontName.family, style: t.fontName.style };
      texts.push(entry);
    }

    // Collect colors from fills
    if ("fills" in n && n.fills !== figma.mixed) {
      for (const paint of n.fills as readonly Paint[]) {
        if (paint.type === "SOLID" && paint.visible !== false) {
          const key = `${paint.color.r.toFixed(3)},${paint.color.g.toFixed(3)},${paint.color.b.toFixed(3)}`;
          if (!colorSet.has(key)) {
            colorSet.add(key);
            colors.push({
              r: paint.color.r,
              g: paint.color.g,
              b: paint.color.b,
              opacity: paint.opacity !== undefined && paint.opacity < 1 ? paint.opacity : undefined,
            });
          }
        }
      }
    }

    // Collect component instances
    if (n.type === "INSTANCE") {
      const compTexts: string[] = [];
      collectInstanceTexts(n, compTexts);
      components.push({ name: n.name, texts: compTexts });
    }

    // Recurse (but don't recurse into instances — already collected their texts)
    if ("children" in n && n.type !== "INSTANCE") {
      for (const child of (n as FrameNode).children) {
        walk(child);
      }
    }
  }

  walk(targetNode);

  // Structure (depth 2, text always included via serializer)
  const structure = await serializeNode(targetNode, 2, ["all"]);

  // Optional screenshot
  let screenshot: { base64: string; format: string; mimeType: string } | null = null;
  if (params.include_screenshot !== false && "exportAsync" in targetNode) {
    try {
      const exportNode = targetNode as SceneNode & ExportMixin;
      const maxWidth = params.max_width || 800;
      const scale = Math.min(1, maxWidth / exportNode.width);
      const bytes = await exportNode.exportAsync({
        format: "PNG",
        constraint: { type: "SCALE", value: scale },
      });
      screenshot = {
        base64: uint8ToBase64(bytes),
        format: "PNG",
        mimeType: "image/png",
      };
    } catch {
      // screenshot failed, continue without it
    }
  }

  return { structure, texts, colors, components, screenshot };
}

function collectInstanceTexts(n: SceneNode, out: string[]): void {
  if (n.type === "TEXT") {
    out.push((n as TextNode).characters);
  }
  if ("children" in n) {
    for (const child of (n as FrameNode).children) {
      collectInstanceTexts(child, out);
    }
  }
}
