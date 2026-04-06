import { serializeNode } from "../serializer";

export async function handleGetDesignContext(params: { nodeId?: string }) {
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

  // Serialize the target node at depth 1 (just its direct properties)
  const node = await serializeNode(targetNode, 1, ["all"]);

  // Serialize direct children at depth 1 for the brief
  let children: Awaited<ReturnType<typeof serializeNode>>[] = [];
  if ("children" in targetNode) {
    const parent = targetNode as FrameNode;
    const MAX_CHILDREN = 30;
    const childSlice = parent.children.slice(0, MAX_CHILDREN);
    children = await Promise.all(childSlice.map((child) => serializeNode(child, 1, ["all"])));
  }

  return { node, children };
}
