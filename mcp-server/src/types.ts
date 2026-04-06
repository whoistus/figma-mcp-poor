// Shared types - mirrored from shared/types.ts for build isolation

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
  | "get_screenshot";

// ---- Property Filter Categories ----

export type PropertyCategory =
  | "layout"
  | "colors"
  | "typography"
  | "spacing"
  | "size"
  | "children"
  | "all";

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
  cornerRadius?: number | "mixed";
  componentId?: string;
  componentName?: string;
  componentProperties?: Record<string, unknown>;
  componentPropertyDefinitions?: Record<string, unknown>;
  overriddenTexts?: Array<{ id: string; name: string; characters: string }>;
  description?: string;
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
