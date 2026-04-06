import { serializeNode, flattenTexts } from "../serializer";
import { uint8ToBase64 } from "../base64";

type PropertyCategory = "layout" | "colors" | "typography" | "spacing" | "size" | "children" | "all";

export async function handleGetNodeById(params: {
  nodeId: string;
  depth?: number;
  properties?: PropertyCategory[];
  flatten_text?: boolean;
  include_screenshot?: boolean;
  max_width?: number;
}) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }
  if (!("type" in node) || node.type === "DOCUMENT" || node.type === "PAGE") {
    throw new Error(`Cannot serialize node type: ${node.type}`);
  }

  const sceneNode = node as SceneNode;
  const depth = params.depth || 1;
  const properties = params.properties || ["all"];

  const serialized = await serializeNode(sceneNode, depth, properties);

  // Flatten all text nodes regardless of depth
  let flatTexts = undefined;
  if (params.flatten_text) {
    flatTexts = flattenTexts(sceneNode);
  }

  // Optional inline screenshot
  let screenshot = undefined;
  if (params.include_screenshot && "exportAsync" in sceneNode) {
    try {
      const exportNode = sceneNode as SceneNode & ExportMixin;
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
      // ignore screenshot failure
    }
  }

  return {
    ...serialized,
    ...(flatTexts ? { flatTexts } : {}),
    ...(screenshot ? { screenshot } : {}),
  };
}
