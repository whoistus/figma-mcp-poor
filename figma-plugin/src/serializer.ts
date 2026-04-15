// Depth-controlled node serializer for Figma Plugin API
// Returns raw structured data -- formatting happens on the MCP server side

interface SerializedPaint {
  type: string;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  gradientStops?: Array<{
    position: number;
    color: { r: number; g: number; b: number; a: number };
  }>;
  visible?: boolean;
}

interface SerializedReaction {
  trigger: string;
  action: string;
  destinationId?: string;
  destinationName?: string;
  url?: string;
  transition?: {
    type: string;
    duration?: number;
    easing?: string;
    direction?: string;
  };
  timeout?: number;
}

interface SerializedNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  opacity?: number;
  rotation?: number;
  fills?: SerializedPaint[];
  strokes?: SerializedPaint[];
  strokeWeight?: number;
  characters?: string;
  fontSize?: number | "mixed";
  fontName?: { family: string; style: string } | "mixed";
  lineHeight?: { value: number; unit: string } | "mixed";
  letterSpacing?: { value: number; unit: string } | "mixed";
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  layoutMode?: string;
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  cornerRadius?: number | "mixed";
  componentId?: string;
  componentName?: string;
  componentProperties?: Record<string, unknown>;
  componentPropertyDefinitions?: Record<string, unknown>;
  overriddenTexts?: Array<{ id: string; name: string; characters: string }>;
  description?: string;
  reactions?: SerializedReaction[];
  children?: SerializedNode[];
  childCount?: number;
  truncated?: boolean;
}

interface FlattenedText {
  id: string;
  name: string;
  characters: string;
  fontSize?: number | "mixed";
  fontName?: { family: string; style: string } | "mixed";
  fills?: SerializedPaint[];
  parentPath: string;
}

type PropertyCategory = "layout" | "colors" | "typography" | "spacing" | "size" | "children" | "all";

const MAX_CHILDREN = 100;

function shouldInclude(categories: PropertyCategory[], category: PropertyCategory): boolean {
  return categories.includes("all") || categories.includes(category);
}

// ---- Depth bonus for semantic node types ----

function getDepthBonus(node: SceneNode): number {
  if (node.type === "COMPONENT_SET") return 2;
  if (node.type === "INSTANCE") return 1;
  return 0;
}

// ---- Main serializer ----

export async function serializeNode(
  node: SceneNode,
  depth: number = 1,
  properties: PropertyCategory[] = ["all"],
  visited = new Set<string>()
): Promise<SerializedNode> {
  // Prevent circular references
  if (visited.has(node.id)) {
    return { id: node.id, name: node.name, type: node.type };
  }
  visited.add(node.id);

  // KEY FIX #1: Even at depth 0, TEXT nodes always include their content
  if (depth <= 0) {
    const stub: SerializedNode = { id: node.id, name: node.name, type: node.type };
    if (node.type === "TEXT") {
      serializeTextProps(node as TextNode, stub);
    }
    return stub;
  }

  const result: SerializedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Only include visible:false (true is default, omit it)
  if (node.visible === false) result.visible = false;

  // Size
  if (shouldInclude(properties, "size")) {
    result.width = node.width;
    result.height = node.height;
    if ("x" in node) {
      result.x = (node as FrameNode).x;
      result.y = (node as FrameNode).y;
    }
    if ("layoutSizingHorizontal" in node) {
      const frame = node as FrameNode;
      if (frame.layoutSizingHorizontal !== "FIXED") result.layoutSizingHorizontal = frame.layoutSizingHorizontal;
      if (frame.layoutSizingVertical !== "FIXED") result.layoutSizingVertical = frame.layoutSizingVertical;
    }
  }

  // Only include non-default opacity/rotation
  if ("opacity" in node && (node as FrameNode).opacity < 1) {
    result.opacity = (node as FrameNode).opacity;
  }
  if ("rotation" in node && (node as FrameNode).rotation !== 0) {
    result.rotation = (node as FrameNode).rotation;
  }

  // Colors (fills, strokes) — skip empty/invisible
  if (shouldInclude(properties, "colors")) {
    if ("fills" in node && node.fills !== figma.mixed) {
      const fills = serializePaints(node.fills as readonly Paint[]);
      if (fills.length) result.fills = fills;
    }
    if ("strokes" in node) {
      const strokes = serializePaints((node as GeometryMixin).strokes);
      if (strokes.length) {
        result.strokes = strokes;
        const sw = (node as GeometryMixin).strokeWeight;
        if (typeof sw === "number" && sw > 0) result.strokeWeight = sw;
      }
    }
    if ("cornerRadius" in node) {
      const cr = (node as RectangleNode).cornerRadius;
      if (cr !== 0 && cr !== figma.mixed) result.cornerRadius = cr as number;
      else if (cr === figma.mixed) result.cornerRadius = "mixed";
    }
  }

  // Typography - always include on TEXT nodes
  if (node.type === "TEXT") {
    serializeTextProps(node as TextNode, result);
  }

  // Layout (auto-layout / flexbox)
  if (shouldInclude(properties, "layout") && "layoutMode" in node) {
    const frame = node as FrameNode;
    result.layoutMode = frame.layoutMode;
    if (frame.layoutMode !== "NONE") {
      result.primaryAxisAlignItems = frame.primaryAxisAlignItems;
      result.counterAxisAlignItems = frame.counterAxisAlignItems;
    }
  }

  // Spacing
  if (shouldInclude(properties, "spacing") && "paddingLeft" in node) {
    const frame = node as FrameNode;
    result.paddingLeft = frame.paddingLeft;
    result.paddingRight = frame.paddingRight;
    result.paddingTop = frame.paddingTop;
    result.paddingBottom = frame.paddingBottom;
    if ("itemSpacing" in frame && frame.layoutMode !== "NONE") {
      result.itemSpacing = frame.itemSpacing;
    }
  }

  // Component info
  if (node.type === "INSTANCE") {
    const instance = node as InstanceNode;
    try {
      const mainComponent = await instance.getMainComponentAsync();
      if (mainComponent) {
        result.componentId = mainComponent.id;
        result.componentName = mainComponent.name;
      }
    } catch {
      // ignore if main component is not accessible
    }
    // Only include component props that have values (skip empty/default)
    const props = instance.componentProperties as Record<string, unknown>;
    if (props && Object.keys(props).length > 0) {
      // Compact: only keep {propName: value} instead of full definition objects
      const compact: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(props)) {
        if (val && typeof val === "object" && "value" in (val as Record<string, unknown>)) {
          compact[key] = (val as Record<string, unknown>).value;
        } else {
          compact[key] = val;
        }
      }
      result.componentProperties = compact;
    }

    // Surface text overrides on INSTANCE nodes
    const texts = collectTexts(instance);
    if (texts.length) result.overriddenTexts = texts;
  }

  if (node.type === "COMPONENT") {
    const comp = node as ComponentNode;
    // Skip full property definitions — too verbose. Just include description.
    if (comp.description) result.description = comp.description;
    // Compact property names only
    const defs = comp.componentPropertyDefinitions;
    if (defs && Object.keys(defs).length > 0) {
      const compact: Record<string, string> = {};
      for (const [key, val] of Object.entries(defs)) {
        compact[key] = (val as Record<string, unknown>).type as string;
      }
      result.componentPropertyDefinitions = compact;
    }
  }

  if (node.type === "COMPONENT_SET") {
    const compSet = node as ComponentSetNode;
    if (compSet.description) result.description = compSet.description;
    const defs = compSet.componentPropertyDefinitions;
    if (defs && Object.keys(defs).length > 0) {
      const compact: Record<string, string> = {};
      for (const [key, val] of Object.entries(defs)) {
        compact[key] = (val as Record<string, unknown>).type as string;
      }
      result.componentPropertyDefinitions = compact;
    }
  }

  // Prototype interactions (reactions)
  if ("reactions" in node) {
    const reactions = serializeReactions(node as SceneNode & { reactions: readonly Reaction[] });
    if (reactions.length) result.reactions = reactions;
  }

  // Children
  if (shouldInclude(properties, "children") && "children" in node) {
    const parent = node as FrameNode;
    const total = parent.children.length;
    const effectiveDepth = depth + getDepthBonus(node);

    if (effectiveDepth > 1) {
      const childrenToSerialize = parent.children.slice(0, MAX_CHILDREN);
      result.children = await Promise.all(
        childrenToSerialize.map((child) =>
          serializeNode(child, effectiveDepth - 1, properties, new Set(visited))
        )
      );
      if (total > MAX_CHILDREN) {
        result.truncated = true;
        result.childCount = total;
      }
    } else {
      // At depth boundary: stubs, but TEXT nodes always get content
      const stubs: SerializedNode[] = [];
      for (const child of parent.children.slice(0, MAX_CHILDREN)) {
        const stub: SerializedNode = { id: child.id, name: child.name, type: child.type };
        if (child.type === "TEXT") {
          serializeTextProps(child as TextNode, stub);
        }
        // For INSTANCE stubs, include overridden texts and component properties
        if (child.type === "INSTANCE") {
          const instance = child as InstanceNode;
          stub.overriddenTexts = collectTexts(instance);
          const props = instance.componentProperties as Record<string, unknown>;
          if (props && Object.keys(props).length > 0) {
            const compact: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(props)) {
              if (val && typeof val === "object" && "value" in (val as Record<string, unknown>)) {
                compact[key] = (val as Record<string, unknown>).value;
              } else {
                compact[key] = val;
              }
            }
            stub.componentProperties = compact;
          }
        }
        stubs.push(stub);
      }
      result.children = stubs;
      if (total > MAX_CHILDREN) {
        result.truncated = true;
      }
      result.childCount = total;
    }
  }

  return result;
}

// ---- Text property extraction (always called for TEXT nodes) ----

function serializeTextProps(text: TextNode, result: SerializedNode): void {
  result.characters = text.characters;
  result.fontSize = text.fontSize === figma.mixed ? "mixed" : text.fontSize;

  const fontName = text.fontName;
  result.fontName = fontName === figma.mixed ? "mixed" : { family: fontName.family, style: fontName.style };

  // Include fills (text color) always for TEXT nodes
  if (text.fills !== figma.mixed) {
    result.fills = serializePaints(text.fills as readonly Paint[]);
  }

  const lineHeight = text.lineHeight;
  if (lineHeight === figma.mixed) {
    result.lineHeight = "mixed";
  } else {
    result.lineHeight = lineHeight.unit === "AUTO"
      ? { value: 0, unit: "AUTO" }
      : { value: lineHeight.value, unit: lineHeight.unit };
  }

  const letterSpacing = text.letterSpacing;
  if (letterSpacing === figma.mixed) {
    result.letterSpacing = "mixed";
  } else {
    result.letterSpacing = { value: letterSpacing.value, unit: letterSpacing.unit };
  }

  result.textAlignHorizontal = text.textAlignHorizontal;
  result.textAlignVertical = text.textAlignVertical;
}

// ---- Collect all text from INSTANCE children (overrides) ----

function collectTexts(node: SceneNode): Array<{ id: string; name: string; characters: string }> {
  const texts: Array<{ id: string; name: string; characters: string }> = [];
  if (node.type === "TEXT") {
    texts.push({ id: node.id, name: node.name, characters: (node as TextNode).characters });
  }
  if ("children" in node) {
    for (const child of (node as FrameNode).children) {
      texts.push(...collectTexts(child));
    }
  }
  return texts;
}

// ---- Flatten all TEXT nodes in a subtree (for flatten_text mode) ----

export function flattenTexts(node: SceneNode, parentPath: string = ""): FlattenedText[] {
  const path = parentPath ? parentPath + " > " + node.name : node.name;
  const results: FlattenedText[] = [];

  if (node.type === "TEXT") {
    const text = node as TextNode;
    const entry: FlattenedText = {
      id: node.id,
      name: node.name,
      characters: text.characters,
      parentPath: path,
    };
    entry.fontSize = text.fontSize === figma.mixed ? "mixed" : text.fontSize;
    entry.fontName = text.fontName === figma.mixed ? "mixed" : { family: text.fontName.family, style: text.fontName.style };
    if (text.fills !== figma.mixed) {
      entry.fills = serializePaints(text.fills as readonly Paint[]);
    }
    results.push(entry);
  }

  if ("children" in node) {
    for (const child of (node as FrameNode).children) {
      results.push(...flattenTexts(child, path));
    }
  }

  return results;
}

// ---- Collect all unique colors in a subtree ----

export function collectColors(node: SceneNode): SerializedPaint[] {
  const seen = new Set<string>();
  const colors: SerializedPaint[] = [];

  function walk(n: SceneNode): void {
    if ("fills" in n && n.fills !== figma.mixed) {
      for (const paint of n.fills as readonly Paint[]) {
        if (paint.type === "SOLID" && paint.visible !== false) {
          const key = `${paint.color.r.toFixed(4)},${paint.color.g.toFixed(4)},${paint.color.b.toFixed(4)}`;
          if (!seen.has(key)) {
            seen.add(key);
            colors.push({
              type: "SOLID",
              color: { r: paint.color.r, g: paint.color.g, b: paint.color.b },
              opacity: paint.opacity,
            });
          }
        }
      }
    }
    if ("children" in n) {
      for (const child of (n as FrameNode).children) {
        walk(child);
      }
    }
  }

  walk(node);
  return colors;
}

// ---- Collect all component instances in a subtree ----

export function collectComponents(node: SceneNode): Array<{
  id: string;
  name: string;
  componentName: string;
  overriddenTexts: Array<{ id: string; name: string; characters: string }>;
}> {
  const results: Array<{
    id: string;
    name: string;
    componentName: string;
    overriddenTexts: Array<{ id: string; name: string; characters: string }>;
  }> = [];

  function walk(n: SceneNode): void {
    if (n.type === "INSTANCE") {
      const instance = n as InstanceNode;
      // mainComponent is sync-accessible during walk since it was already loaded
      // but to be safe, we use the name from componentProperties
      results.push({
        id: n.id,
        name: n.name,
        componentName: n.name,
        overriddenTexts: collectTexts(n),
      });
    }
    if ("children" in n) {
      for (const child of (n as FrameNode).children) {
        walk(child);
      }
    }
  }

  walk(node);
  return results;
}

// ---- Reaction serializer ----

function serializeReactions(node: SceneNode & { reactions: readonly Reaction[] }): SerializedReaction[] {
  const results: SerializedReaction[] = [];
  for (const reaction of node.reactions) {
    if (!reaction.trigger || !reaction.action) continue;

    const serialized: SerializedReaction = {
      trigger: reaction.trigger.type,
      action: reaction.action.type,
    };

    // Destination node
    if (reaction.action.type === "NAVIGATE" || reaction.action.type === "SWAP_OVERLAY") {
      const action = reaction.action as { destinationId?: string | null; navigation?: string };
      if (action.destinationId) {
        serialized.destinationId = action.destinationId;
        // Try to resolve destination name
        try {
          const destNode = figma.getNodeById(action.destinationId);
          if (destNode) serialized.destinationName = destNode.name;
        } catch { /* ignore */ }
      }
    }

    // URL for OPEN_URL actions
    if (reaction.action.type === "OPEN_URL") {
      const action = reaction.action as { url?: string };
      if (action.url) serialized.url = action.url;
    }

    // Transition animation
    if ("transition" in reaction.action && reaction.action.transition) {
      const t = reaction.action.transition as {
        type: string;
        duration?: number;
        easing?: { type: string };
        direction?: string;
      };
      serialized.transition = { type: t.type };
      if (t.duration !== undefined) serialized.transition.duration = t.duration;
      if (t.easing) serialized.transition.easing = t.easing.type;
      if (t.direction) serialized.transition.direction = t.direction;
    }

    // Timeout trigger delay
    if (reaction.trigger.type === "AFTER_TIMEOUT" && "timeout" in reaction.trigger) {
      serialized.timeout = (reaction.trigger as { timeout: number }).timeout;
    }

    results.push(serialized);
  }
  return results;
}

// ---- Collect all prototype flows from a node tree ----

export function collectFlows(node: SceneNode): Array<{
  sourceId: string;
  sourceName: string;
  reactions: SerializedReaction[];
}> {
  const connections: Array<{ sourceId: string; sourceName: string; reactions: SerializedReaction[] }> = [];

  function walk(n: SceneNode): void {
    if ("reactions" in n) {
      const reactions = serializeReactions(n as SceneNode & { reactions: readonly Reaction[] });
      if (reactions.length) {
        connections.push({ sourceId: n.id, sourceName: n.name, reactions });
      }
    }
    if ("children" in n) {
      for (const child of (n as FrameNode).children) {
        walk(child);
      }
    }
  }

  walk(node);
  return connections;
}

// ---- Paint serializer ----

function serializePaints(paints: readonly Paint[]): SerializedPaint[] {
  const results: SerializedPaint[] = [];
  for (const paint of paints) {
    // Skip invisible paints entirely — saves tokens
    if (paint.visible === false) continue;

    const result: SerializedPaint = { type: paint.type };
    // Only include opacity if not 1
    if (paint.opacity !== undefined && paint.opacity < 1) result.opacity = paint.opacity;

    if (paint.type === "SOLID") {
      result.color = { r: paint.color.r, g: paint.color.g, b: paint.color.b };
    }

    if ("gradientStops" in paint) {
      result.gradientStops = paint.gradientStops.map((stop) => ({
        position: stop.position,
        color: { r: stop.color.r, g: stop.color.g, b: stop.color.b, a: stop.color.a },
      }));
    }

    results.push(result);
  }
  return results;
}
