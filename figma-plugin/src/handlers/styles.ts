interface SerializedStyle {
  id: string;
  name: string;
  type: "paint" | "text" | "effect" | "grid";
  properties: Record<string, unknown>;
}

export async function handleGetStyles(params: {
  styleType?: "paint" | "text" | "effect" | "grid";
}): Promise<SerializedStyle[]> {
  const results: SerializedStyle[] = [];
  const filter = params.styleType;

  if (!filter || filter === "paint") {
    const styles = await figma.getLocalPaintStylesAsync();
    for (const style of styles) {
      results.push({
        id: style.id,
        name: style.name,
        type: "paint",
        properties: {
          paints: style.paints.map((p) => ({
            type: p.type,
            visible: p.visible,
            opacity: p.opacity,
            ...(p.type === "SOLID" ? { color: { r: p.color.r, g: p.color.g, b: p.color.b } } : {}),
          })),
        },
      });
    }
  }

  if (!filter || filter === "text") {
    const styles = await figma.getLocalTextStylesAsync();
    for (const style of styles) {
      results.push({
        id: style.id,
        name: style.name,
        type: "text",
        properties: {
          fontFamily: style.fontName.family,
          fontStyle: style.fontName.style,
          fontWeight: fontStyleToWeight(style.fontName.style),
          fontSize: style.fontSize,
          lineHeight: style.lineHeight.unit === "AUTO"
            ? { value: 0, unit: "AUTO" }
            : { value: style.lineHeight.value, unit: style.lineHeight.unit },
          letterSpacing: { value: style.letterSpacing.value, unit: style.letterSpacing.unit },
          textDecoration: style.textDecoration,
        },
      });
    }
  }

  if (!filter || filter === "effect") {
    const styles = await figma.getLocalEffectStylesAsync();
    for (const style of styles) {
      results.push({
        id: style.id,
        name: style.name,
        type: "effect",
        properties: {
          effects: style.effects.map((e) => ({
            type: e.type,
            visible: e.visible,
            ...("radius" in e ? { radius: e.radius } : {}),
            ...("offset" in e ? { offset: e.offset } : {}),
            ...("color" in e ? { color: { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a } } : {}),
          })),
        },
      });
    }
  }

  if (!filter || filter === "grid") {
    const styles = await figma.getLocalGridStylesAsync();
    for (const style of styles) {
      results.push({
        id: style.id,
        name: style.name,
        type: "grid",
        properties: {
          grids: style.layoutGrids.map((g) => ({
            pattern: g.pattern,
            ...(g.pattern !== "GRID" ? { sectionSize: g.sectionSize } : {}),
            ...("gutterSize" in g ? { gutterSize: g.gutterSize } : {}),
            ...("count" in g ? { count: g.count } : {}),
          })),
        },
      });
    }
  }

  return results;
}

function fontStyleToWeight(style: string): number {
  const s = style.toLowerCase();
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("demibold")) return 600;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("bold")) return 700;
  if (s.includes("black") || s.includes("heavy")) return 900;
  return 400;
}
