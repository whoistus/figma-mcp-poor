import { serializeNode, flattenTexts } from "../serializer";
import { uint8ToBase64 } from "../base64";

export async function handleGetSelection(params: {
  depth?: number;
  flatten_text?: boolean;
  include_screenshot?: boolean;
  max_width?: number;
}) {
  const selection = figma.currentPage.selection;
  if (!selection.length) return [];

  const depth = params.depth || 1;
  const results = await Promise.all(selection.map(async (node) => {
    const serialized = await serializeNode(node, depth);

    // Flatten all text nodes regardless of depth
    let flatTexts = undefined;
    if (params.flatten_text) {
      flatTexts = flattenTexts(node);
    }

    // Optional inline screenshot
    let screenshot = undefined;
    if (params.include_screenshot && "exportAsync" in node) {
      try {
        const exportNode = node as SceneNode & ExportMixin;
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
        // ignore
      }
    }

    return {
      ...serialized,
      ...(flatTexts ? { flatTexts } : {}),
      ...(screenshot ? { screenshot } : {}),
    };
  }));

  return results;
}
