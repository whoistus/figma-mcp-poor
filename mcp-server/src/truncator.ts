const DEFAULT_MAX_TOKENS = 8000;
const CHARS_PER_TOKEN = 4;

export function estimateTokens(data: unknown): number {
  const json = typeof data === "string" ? data : JSON.stringify(data);
  return Math.ceil(json.length / CHARS_PER_TOKEN);
}

export function truncateResponse(data: unknown, maxTokens = DEFAULT_MAX_TOKENS): unknown {
  const tokens = estimateTokens(data);
  if (tokens <= maxTokens) return data;

  if (Array.isArray(data)) {
    return truncateArray(data, maxTokens);
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.children)) {
      return {
        ...obj,
        children: truncateArray(obj.children, Math.floor(maxTokens * 0.7)),
      };
    }
  }

  // Fallback: hard character limit
  const json = JSON.stringify(data);
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (json.length > maxChars) {
    return json.slice(0, maxChars) + "...";
  }

  return data;
}

function truncateArray(arr: unknown[], maxTokens: number): unknown[] {
  if (arr.length === 0) return arr;

  let lo = 1;
  let hi = arr.length;
  let best = 1;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = arr.slice(0, mid);
    if (estimateTokens(slice) <= maxTokens * 0.9) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best >= arr.length) return arr;

  const result = arr.slice(0, best);
  result.push({ _more: arr.length - best });
  return result;
}
