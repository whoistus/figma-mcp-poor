import type { SerializedNode, SerializedPaint, SerializedStyle, SerializedVariable } from "./types.js";

// ---- Color Formatting ----

function clamp(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

export function formatColor(color: { r: number; g: number; b: number }, opacity?: number): string {
  const r = clamp(color.r);
  const g = clamp(color.g);
  const b = clamp(color.b);
  if (opacity !== undefined && opacity < 1) {
    return `rgba(${r}, ${g}, ${b}, ${Number(opacity.toFixed(2))})`;
  }
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
}

export function formatPaint(paint: SerializedPaint): string | null {
  if (paint.visible === false) return null;
  if (paint.type === "SOLID" && paint.color) {
    return formatColor(paint.color, paint.opacity);
  }
  if (paint.type.startsWith("GRADIENT_") && paint.gradientStops) {
    const stops = paint.gradientStops
      .map((s) => `${formatColor(s.color, s.color.a)} ${Math.round(s.position * 100)}%`)
      .join(", ");
    const gradientType = paint.type === "GRADIENT_LINEAR" ? "linear-gradient" : "radial-gradient";
    return `${gradientType}(${stops})`;
  }
  if (paint.type === "IMAGE") return "url(image)";
  return paint.type.toLowerCase();
}

export function formatFills(fills?: SerializedPaint[]): string | undefined {
  if (!fills?.length) return undefined;
  const values = fills.map(formatPaint).filter(Boolean);
  return values.length ? values.join(", ") : undefined;
}

// ---- Typography Formatting ----

export function formatFont(node: SerializedNode): string | undefined {
  if (node.type !== "TEXT") return undefined;
  const parts: string[] = [];

  if (node.fontName && node.fontName !== "mixed") {
    const weight = fontStyleToWeight(node.fontName.style);
    if (weight !== "400") parts.push(weight);
  }

  if (node.fontSize && node.fontSize !== "mixed") {
    let sizeStr = `${node.fontSize}px`;
    if (node.lineHeight && node.lineHeight !== "mixed" && node.lineHeight.unit !== "AUTO") {
      const lh = node.lineHeight.unit === "PIXELS"
        ? `${node.lineHeight.value}px`
        : `${node.lineHeight.value}%`;
      sizeStr += `/${lh}`;
    }
    parts.push(sizeStr);
  }

  if (node.fontName && node.fontName !== "mixed") {
    parts.push(node.fontName.family);
  }

  return parts.length ? parts.join(" ") : undefined;
}

function fontStyleToWeight(style: string): string {
  const s = style.toLowerCase();
  if (s.includes("thin")) return "100";
  if (s.includes("extralight") || s.includes("ultralight")) return "200";
  if (s.includes("light")) return "300";
  if (s.includes("medium")) return "500";
  if (s.includes("semibold") || s.includes("demibold")) return "600";
  if (s.includes("extrabold") || s.includes("ultrabold")) return "800";
  if (s.includes("bold")) return "700";
  if (s.includes("black") || s.includes("heavy")) return "900";
  return "400";
}

// ---- Layout Formatting ----

export interface FormattedLayout {
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string;
  padding?: string;
}

export function formatLayout(node: SerializedNode): FormattedLayout | undefined {
  if (!node.layoutMode || node.layoutMode === "NONE") return undefined;

  const layout: FormattedLayout = {
    display: "flex",
    flexDirection: node.layoutMode === "HORIZONTAL" ? "row" : "column",
  };

  if (node.primaryAxisAlignItems) {
    layout.justifyContent = mapAlignment(node.primaryAxisAlignItems);
  }
  if (node.counterAxisAlignItems) {
    layout.alignItems = mapAlignment(node.counterAxisAlignItems);
  }
  if (node.itemSpacing) {
    layout.gap = `${node.itemSpacing}px`;
  }

  const padding = formatPadding(node);
  if (padding) layout.padding = padding;

  return layout;
}

function mapAlignment(align: string): string {
  switch (align) {
    case "MIN": return "flex-start";
    case "MAX": return "flex-end";
    case "CENTER": return "center";
    case "SPACE_BETWEEN": return "space-between";
    default: return align.toLowerCase();
  }
}

function formatPadding(node: SerializedNode): string | undefined {
  const t = node.paddingTop ?? 0;
  const r = node.paddingRight ?? 0;
  const b = node.paddingBottom ?? 0;
  const l = node.paddingLeft ?? 0;
  if (t === 0 && r === 0 && b === 0 && l === 0) return undefined;
  if (t === b && l === r && t === l) return `${t}px`;
  if (t === b && l === r) return `${t}px ${r}px`;
  return `${t}px ${r}px ${b}px ${l}px`;
}

// ---- Size Formatting ----

export function formatSize(node: SerializedNode): { width: string; height: string } | undefined {
  if (node.width === undefined && node.height === undefined) return undefined;
  return {
    width: formatSizingDimension(node.layoutSizingHorizontal, node.width),
    height: formatSizingDimension(node.layoutSizingVertical, node.height),
  };
}

function formatSizingDimension(sizing?: string, value?: number): string {
  if (sizing === "FILL") return "fill (flex: 1)";
  if (sizing === "HUG") return "hug-content";
  return value !== undefined ? `${Math.round(value)}px` : "auto";
}

// ---- Node Formatting (main entry) ----

export interface FormattedNode {
  id: string;
  name: string;
  type: string;
  size?: string;
  pos?: string;
  bg?: string;
  border?: string;
  radius?: string;
  opacity?: number;
  font?: string;
  text?: string;
  color?: string;
  layout?: FormattedLayout;
  componentName?: string;
  props?: Record<string, unknown>;
  desc?: string;
  overriddenTexts?: Array<{ name: string; text: string }>;
  children?: FormattedNode[];
  childCount?: number;
  truncated?: boolean;
}

export function formatNode(node: SerializedNode): FormattedNode {
  const f: FormattedNode = {
    id: node.id,
    name: node.name,
    type: node.type,
  };

  // Compact size: "200x48" or "fill x hug"
  const size = formatSize(node);
  if (size) f.size = `${size.width} x ${size.height}`;
  // Compact position: "x,y"
  if (node.x !== undefined && node.y !== undefined) {
    f.pos = `${Math.round(node.x)},${Math.round(node.y)}`;
  }

  // Colors
  const bg = formatFills(node.fills);
  if (bg) f.bg = bg;

  if (node.strokes?.length) {
    const strokeColor = formatFills(node.strokes);
    if (strokeColor) f.border = `${node.strokeWeight ?? 1}px solid ${strokeColor}`;
  }

  if (node.cornerRadius !== undefined && node.cornerRadius !== 0) {
    f.radius = node.cornerRadius === "mixed" ? "mixed" : `${node.cornerRadius}px`;
  }

  if (node.opacity !== undefined && node.opacity < 1) {
    f.opacity = Number(node.opacity.toFixed(2));
  }

  // Typography
  if (node.type === "TEXT") {
    const font = formatFont(node);
    if (font) f.font = font;
    if (node.characters) f.text = node.characters;
    if (bg) f.color = bg;
    delete f.bg;
  }

  // Layout
  const layout = formatLayout(node);
  if (layout) f.layout = layout;

  // Component
  if (node.componentName) f.componentName = node.componentName;
  if (node.componentProperties && Object.keys(node.componentProperties).length > 0) {
    f.props = node.componentProperties;
  }
  if (node.description) f.desc = node.description;

  // Overridden texts from instances — compact: just name + text
  if (node.overriddenTexts?.length) {
    f.overriddenTexts = node.overriddenTexts.map((t) => ({
      name: t.name,
      text: t.characters,
    }));
  }

  // Children
  if (node.children) {
    f.children = node.children.map(formatNode);
  }
  if (node.childCount !== undefined) f.childCount = node.childCount;
  if (node.truncated) f.truncated = true;

  return f;
}

// ---- Style Formatting ----

export function formatStyle(style: SerializedStyle): Record<string, string> {
  const result: Record<string, string> = { name: style.name, type: style.type };
  const props = style.properties;

  if (style.type === "paint" && Array.isArray(props.paints)) {
    const fills = formatFills(props.paints as SerializedPaint[]);
    if (fills) result.value = fills;
  }

  if (style.type === "text") {
    const parts: string[] = [];
    if (props.fontWeight) parts.push(String(props.fontWeight));
    if (props.fontSize) {
      let s = `${props.fontSize}px`;
      if (props.lineHeight && typeof props.lineHeight === "object" && (props.lineHeight as Record<string, unknown>).unit !== "AUTO") {
        const lh = props.lineHeight as { value: number; unit: string };
        s += `/${lh.unit === "PIXELS" ? `${lh.value}px` : `${lh.value}%`}`;
      }
      parts.push(s);
    }
    if (props.fontFamily) parts.push(String(props.fontFamily));
    if (parts.length) result.value = parts.join(" ");
  }

  if (style.type === "effect" && Array.isArray(props.effects)) {
    const effects = (props.effects as Array<Record<string, unknown>>).map((e) => {
      if (e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW") {
        const offset = e.offset as { x: number; y: number } | undefined;
        const color = e.color as { r: number; g: number; b: number; a: number } | undefined;
        const prefix = e.type === "INNER_SHADOW" ? "inset " : "";
        return `${prefix}${offset?.x ?? 0}px ${offset?.y ?? 0}px ${e.radius ?? 0}px ${color ? formatColor(color, color.a) : ""}`.trim();
      }
      if (e.type === "LAYER_BLUR" || e.type === "BACKGROUND_BLUR") {
        return `blur(${e.radius ?? 0}px)`;
      }
      return String(e.type).toLowerCase();
    });
    result.value = effects.join(", ");
  }

  return result;
}

// ---- Variable Formatting ----

export function formatVariable(variable: SerializedVariable): Record<string, string> {
  const result: Record<string, string> = {
    name: variable.name,
    collection: variable.collection,
    type: variable.resolvedType,
  };

  const entries = Object.entries(variable.values);
  if (entries.length === 1) {
    result.value = formatVariableValue(variable.resolvedType, entries[0][1]);
  } else {
    for (const [mode, val] of entries) {
      result[`value:${mode}`] = formatVariableValue(variable.resolvedType, val);
    }
  }

  return result;
}

function formatVariableValue(type: string, value: unknown): string {
  if (type === "COLOR" && value && typeof value === "object") {
    const c = value as { r: number; g: number; b: number; a?: number };
    return formatColor(c, c.a);
  }
  if (type === "FLOAT" && typeof value === "number") {
    return `${value}px`;
  }
  return String(value);
}

// ---- Design Context Brief ----

export function formatDesignBrief(node: SerializedNode, children: SerializedNode[]): string {
  const lines: string[] = [`## ${node.name} (${node.type})`];

  // Size
  const size = formatSize(node);
  if (size) lines.push(`- Size: ${size.width} x ${size.height}`);

  // Layout
  const layout = formatLayout(node);
  if (layout) {
    const parts = [`${layout.flexDirection}`];
    if (layout.gap) parts.push(`gap ${layout.gap}`);
    if (layout.padding) parts.push(`padding ${layout.padding}`);
    if (layout.justifyContent) parts.push(`justify ${layout.justifyContent}`);
    if (layout.alignItems) parts.push(`align ${layout.alignItems}`);
    lines.push(`- Layout: ${parts.join(", ")}`);
  }

  // Background
  const bg = formatFills(node.fills);
  if (bg) lines.push(`- Background: ${bg}`);

  // Border
  if (node.strokes?.length) {
    const strokeColor = formatFills(node.strokes);
    if (strokeColor) {
      lines.push(`- Border: ${node.strokeWeight ?? 1}px solid ${strokeColor}`);
    }
  }
  if (node.cornerRadius && node.cornerRadius !== 0) {
    lines.push(`- Border radius: ${node.cornerRadius === "mixed" ? "mixed" : `${node.cornerRadius}px`}`);
  }

  // Children summary
  const texts = children.filter((c) => c.type === "TEXT");
  const frames = children.filter((c) => ["FRAME", "GROUP", "COMPONENT", "INSTANCE"].includes(c.type));
  const shapes = children.filter((c) => ["RECTANGLE", "ELLIPSE", "VECTOR", "LINE"].includes(c.type));

  for (const text of texts) {
    const font = formatFont(text);
    const color = formatFills(text.fills);
    const parts = [`"${text.characters ?? ""}"`.slice(0, 80)];
    if (font) parts.push(font);
    if (color) parts.push(color);
    lines.push(`- Text: ${parts.join(" - ")}`);
  }

  if (frames.length) {
    lines.push(`- Child containers: ${frames.map((f) => `${f.name} (${f.type})`).join(", ")}`);
  }

  if (shapes.length) {
    for (const shape of shapes.slice(0, 5)) {
      const fill = formatFills(shape.fills);
      lines.push(`- ${shape.type}: ${shape.name}${fill ? ` - ${fill}` : ""}`);
    }
    if (shapes.length > 5) lines.push(`  ... and ${shapes.length - 5} more shapes`);
  }

  // Component info
  if (node.componentName) lines.push(`- Component: ${node.componentName}`);
  if (node.description) lines.push(`- Description: ${node.description}`);

  return lines.join("\n");
}
