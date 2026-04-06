import { serializeNode } from "../serializer";

export async function handleGetComponents(params: { name?: string }) {
  const allComponents = figma.root.findAllWithCriteria({
    types: ["COMPONENT", "COMPONENT_SET"],
  });

  let components = allComponents;
  if (params.name) {
    const search = params.name.toLowerCase();
    components = components.filter((c) => c.name.toLowerCase().includes(search));
  }

  // Cap to prevent huge responses
  const MAX_COMPONENTS = 50;
  const truncated = components.length > MAX_COMPONENTS;
  const slice = components.slice(0, MAX_COMPONENTS);

  const results = await Promise.all(slice.map((comp) => serializeNode(comp, 1, ["all"])));

  if (truncated) {
    return {
      components: results,
      _truncated: true,
      _total: components.length,
      _showing: MAX_COMPONENTS,
      _hint: "Use the 'name' parameter to filter components",
    };
  }

  return results;
}
