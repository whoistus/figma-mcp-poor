import { collectFlows } from "../serializer";

export async function handleGetFlows(params: { nodeId?: string; depth?: number }) {
  const page = figma.currentPage;

  // Flow starting points from the page
  const startingPoints = page.flowStartingPoints.map((fp) => {
    let name = fp.name;
    // Resolve node name if flow name is empty
    if (!name) {
      try {
        const node = figma.getNodeById(fp.nodeId);
        if (node) name = node.name;
      } catch { /* ignore */ }
    }
    return { nodeId: fp.nodeId, name: name || "Unnamed flow" };
  });

  // Collect all prototype connections from the target subtree
  let rootNode: SceneNode;
  if (params.nodeId) {
    const node = figma.getNodeById(params.nodeId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") {
      throw new Error(`Node not found or invalid: ${params.nodeId}`);
    }
    rootNode = node as SceneNode;
  } else {
    // Default: scan entire current page
    rootNode = page as unknown as SceneNode;
  }

  // Walk the tree and collect connections
  const connections = "children" in rootNode
    ? (rootNode as FrameNode).children.flatMap((child) => collectFlows(child))
    : collectFlows(rootNode);

  return {
    startingPoints,
    connections,
    totalConnections: connections.length,
  };
}
