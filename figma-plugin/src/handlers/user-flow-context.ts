import { handleGetFlows } from "./flows";
import type {
  FlowGraph,
  FlowGraphEdge,
  FlowGraphInferredEdge,
  FlowGraphNode,
  GetUserFlowContextParams,
} from "../../../shared/types";

const MAX_PATHS = 200;

export async function handleGetUserFlowContext(
  params: GetUserFlowContextParams,
): Promise<FlowGraph> {
  const maxDepth = params.maxDepth ?? 10;
  const { startingPoints, connections } = await handleGetFlows({ nodeId: params.nodeId });

  // Build edges — skip reactions without a destination (BACK/CLOSE/OPEN_URL)
  const edges: FlowGraphEdge[] = [];
  for (const conn of connections) {
    for (const reaction of conn.reactions) {
      if (!reaction.destinationId) continue;
      edges.push({
        from: conn.sourceId,
        to: reaction.destinationId,
        trigger: reaction.trigger,
        action: reaction.action,
        element: conn.sourceName,
      });
    }
  }

  // Collect unique node IDs from all sources and destinations
  const nodeIds = new Set<string>([
    ...startingPoints.map((sp) => sp.nodeId),
    ...edges.map((e) => e.from),
    ...edges.map((e) => e.to),
  ]);

  // Resolve node metadata via figma.getNodeById
  const nodes: FlowGraphNode[] = [];
  for (const id of nodeIds) {
    const n = figma.getNodeById(id);
    nodes.push({ id, name: n?.name ?? id, type: n?.type ?? "UNKNOWN" });
  }

  const spIds = startingPoints.map((sp) => sp.nodeId);
  const hasFlow = edges.length > 0;

  // BFS path traversal (only when real flow exists)
  const paths: string[][] = [];
  if (hasFlow && spIds.length > 0) {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push(e.to);
    }

    for (const startId of spIds) {
      const queue: string[][] = [[startId]];
      while (queue.length && paths.length < MAX_PATHS) {
        const path = queue.shift()!;
        const last = path[path.length - 1];
        const neighbors = adj.get(last) ?? [];

        if (!neighbors.length || path.length >= maxDepth) {
          paths.push(path);
          continue;
        }

        for (const next of neighbors) {
          // Cycle guard: skip nodes already in this path
          if (path.includes(next)) {
            paths.push(path);
            continue;
          }
          queue.push([...path, next]);
        }
      }
    }

    // Ensure starting points appear as single-node paths when they have no outgoing edges
    if (paths.length === 0) {
      for (const id of spIds) paths.push([id]);
    }
  }

  // Heuristic inferred edges — only when no real flow and caller opts in
  let inferredEdges: FlowGraphInferredEdge[] | undefined;
  if (!hasFlow && params.includeInference) {
    inferredEdges = inferFlowEdges(params.nodeId);
  }

  return {
    nodes,
    edges,
    startingPoints: spIds,
    paths,
    metadata: { hasFlow, totalNodes: nodes.length, totalEdges: edges.length },
    ...(inferredEdges ? { inferredEdges } : {}),
  };
}

// Heuristic inference when no prototype connections exist
function inferFlowEdges(nodeId?: string): FlowGraphInferredEdge[] {
  const inferred: FlowGraphInferredEdge[] = [];
  const scope = nodeId ? figma.getNodeById(nodeId) : figma.currentPage;
  if (!scope || !("children" in scope)) return inferred;

  const frames = (scope as ChildrenMixin).children.filter(
    (n) => n.type === "FRAME",
  ) as FrameNode[];

  // Heuristic 1: direct children named with action keywords → next sibling frame
  // (use children instead of findAll to avoid slow full-subtree walk)
  const actionKeywords = /next|submit|confirm|continue|go/i;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const hasActionEl = frame.children.some((n) => actionKeywords.test(n.name));
    if (hasActionEl && i + 1 < frames.length) {
      inferred.push({
        from: frame.id,
        to: frames[i + 1].id,
        confidence: 0.5,
        reason: "action-named element found in frame",
      });
    }
  }

  // Heuristic 2: list → detail name pattern
  const listFrames = frames.filter((f) => /list/i.test(f.name));
  const detailFrames = frames.filter((f) => /detail/i.test(f.name));
  for (const lf of listFrames) {
    if (detailFrames.length) {
      inferred.push({
        from: lf.id,
        to: detailFrames[0].id,
        confidence: 0.3,
        reason: "list→detail name pattern",
      });
    }
  }

  return inferred;
}
