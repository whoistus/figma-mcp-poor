// ---- WebSocket Protocol Types ----

export interface PluginRequest {
  id: string;
  type: ToolType;
  params: Record<string, unknown>;
}

export interface PluginResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type ToolType =
  | "get_document_info"
  | "get_selection"
  | "get_node_by_id"
  | "get_styles"
  | "get_variables"
  | "get_components"
  | "get_design_context"
  | "get_screenshot"
  | "get_flows";

// ---- Property Filter Categories ----

export type PropertyCategory =
  | "layout"
  | "colors"
  | "typography"
  | "spacing"
  | "size"
  | "children"
  | "all";

// ---- Tool Parameters ----

export interface GetSelectionParams {
  depth?: number;
}

export interface GetNodeByIdParams {
  nodeId: string;
  depth?: number;
  properties?: PropertyCategory[];
}

export interface GetStylesParams {
  styleType?: "paint" | "text" | "effect" | "grid";
}

export interface GetVariablesParams {
  collection?: string;
  type?: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
}

export interface GetComponentsParams {
  name?: string;
}

export interface GetDesignContextParams {
  nodeId?: string;
  format?: "brief" | "detailed";
}

export interface GetScreenshotParams {
  nodeId: string;
  scale?: number;
  format?: "PNG" | "JPG" | "SVG";
}

export interface GetFlowsParams {
  nodeId?: string;
  depth?: number;
}

// ---- Prototype Flow Types ----

export type TriggerType =
  | "ON_CLICK"
  | "ON_HOVER"
  | "ON_PRESS"
  | "ON_DRAG"
  | "MOUSE_ENTER"
  | "MOUSE_LEAVE"
  | "MOUSE_UP"
  | "MOUSE_DOWN"
  | "AFTER_TIMEOUT";

export type ActionType =
  | "NAVIGATE"
  | "SWAP_OVERLAY"
  | "OPEN_URL"
  | "BACK"
  | "CLOSE"
  | "SET_VARIABLE"
  | "SCROLL_TO"
  | "UPDATE_MEDIA_RUNTIME";

export type TransitionType =
  | "DISSOLVE"
  | "SMART_ANIMATE"
  | "MOVE_IN"
  | "MOVE_OUT"
  | "PUSH"
  | "SLIDE_IN"
  | "SLIDE_OUT"
  | "INSTANT";

export interface SerializedTransition {
  type: TransitionType;
  duration?: number;
  easing?: string;
  direction?: string;
}

export interface SerializedReaction {
  trigger: TriggerType;
  action: ActionType;
  destinationId?: string;
  destinationName?: string;
  url?: string;
  transition?: SerializedTransition;
  timeout?: number;
}

export interface SerializedFlowStartingPoint {
  nodeId: string;
  name: string;
}

export interface SerializedFlowConnection {
  sourceId: string;
  sourceName: string;
  reactions: SerializedReaction[];
}

export interface SerializedFlowData {
  startingPoints: SerializedFlowStartingPoint[];
  connections: SerializedFlowConnection[];
  totalConnections: number;
}

// ---- Serialized Node (from plugin to server) ----

export interface SerializedNode {
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
  // Colors
  fills?: SerializedPaint[];
  strokes?: SerializedPaint[];
  strokeWeight?: number;
  // Typography (TEXT nodes)
  characters?: string;
  fontSize?: number | "mixed";
  fontName?: { family: string; style: string } | "mixed";
  lineHeight?: { value: number; unit: string } | "mixed";
  letterSpacing?: { value: number; unit: string } | "mixed";
  textAlignHorizontal?: string;
  textAlignVertical?: string;
  // Layout
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
  primaryAxisAlignItems?: string;
  counterAxisAlignItems?: string;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  itemSpacing?: number;
  layoutSizingHorizontal?: string;
  layoutSizingVertical?: string;
  // Shape
  cornerRadius?: number | "mixed";
  // Component
  componentId?: string;
  componentName?: string;
  componentProperties?: Record<string, unknown>;
  componentPropertyDefinitions?: Record<string, unknown>;
  description?: string;
  // Prototype interactions
  reactions?: SerializedReaction[];
  // Children
  children?: SerializedNode[];
  childCount?: number;
  truncated?: boolean;
}

export interface SerializedPaint {
  type: string;
  color?: { r: number; g: number; b: number };
  opacity?: number;
  gradientStops?: Array<{
    position: number;
    color: { r: number; g: number; b: number; a: number };
  }>;
  visible?: boolean;
}

export interface SerializedStyle {
  id: string;
  name: string;
  type: "paint" | "text" | "effect" | "grid";
  properties: Record<string, unknown>;
}

export interface SerializedVariable {
  id: string;
  name: string;
  resolvedType: string;
  collection: string;
  values: Record<string, unknown>;
}
