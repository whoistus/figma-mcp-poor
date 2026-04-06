import { uint8ToBase64 } from "../base64";

export async function handleGetScreenshot(params: {
  nodeId: string;
  scale?: number;
  format?: "PNG" | "JPG" | "SVG";
  max_width?: number;
}) {
  const node = await figma.getNodeByIdAsync(params.nodeId);
  if (!node) {
    throw new Error(`Node not found: ${params.nodeId}`);
  }

  if (!("exportAsync" in node)) {
    throw new Error(`Node type ${node.type} does not support export`);
  }

  const exportNode = node as SceneNode & ExportMixin;
  const format = params.format ?? "PNG";
  const maxWidth = params.max_width ?? 800;
  let scale = params.scale ?? 1;
  if (format !== "SVG") {
    scale = Math.min(scale, maxWidth / exportNode.width);
  }

  const bytes = await exportNode.exportAsync({
    format,
    ...(format !== "SVG" ? { constraint: { type: "SCALE", value: scale } } : {}),
  });

  const base64 = format === "SVG"
    ? String.fromCharCode(...bytes)
    : uint8ToBase64(bytes);

  return {
    base64,
    format,
    mimeType: format === "SVG" ? "image/svg+xml" : `image/${format.toLowerCase()}`,
    width: exportNode.width,
    height: exportNode.height,
  };
}
