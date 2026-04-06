interface SerializedVariable {
  id: string;
  name: string;
  resolvedType: string;
  collection: string;
  values: Record<string, unknown>;
}

export async function handleGetVariables(params: {
  collection?: string;
  type?: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
}): Promise<SerializedVariable[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  // Build collection name map and mode name map
  const collectionMap = new Map<string, { name: string; modes: Map<string, string> }>();
  for (const col of collections) {
    const modes = new Map<string, string>();
    for (const mode of col.modes) {
      modes.set(mode.modeId, mode.name);
    }
    collectionMap.set(col.id, { name: col.name, modes });
  }

  // Filter collections by name if specified
  let targetCollectionIds: Set<string> | null = null;
  if (params.collection) {
    const search = params.collection.toLowerCase();
    targetCollectionIds = new Set<string>();
    for (const [id, info] of collectionMap) {
      if (info.name.toLowerCase().includes(search)) {
        targetCollectionIds.add(id);
      }
    }
  }

  // Get variables
  const variables = await figma.variables.getLocalVariablesAsync(params.type);

  const results: SerializedVariable[] = [];
  for (const variable of variables) {
    // Filter by collection
    if (targetCollectionIds && !targetCollectionIds.has(variable.variableCollectionId)) {
      continue;
    }

    const colInfo = collectionMap.get(variable.variableCollectionId);
    const values: Record<string, unknown> = {};

    for (const [modeId, value] of Object.entries(variable.valuesByMode)) {
      const modeName = colInfo?.modes.get(modeId) ?? modeId;
      values[modeName] = serializeVariableValue(value);
    }

    results.push({
      id: variable.id,
      name: variable.name,
      resolvedType: variable.resolvedType,
      collection: colInfo?.name ?? "Unknown",
      values,
    });
  }

  return results;
}

function serializeVariableValue(value: VariableValue): unknown {
  if (typeof value === "object" && value !== null && "type" in value) {
    // This is a VariableAlias
    const alias = value as { type: "VARIABLE_ALIAS"; id: string };
    return { _alias: alias.id };
  }

  if (typeof value === "object" && value !== null && "r" in value) {
    // This is an RGBA color
    const color = value as RGBA;
    return { r: color.r, g: color.g, b: color.b, a: color.a };
  }

  return value;
}
