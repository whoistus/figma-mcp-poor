const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Encode a Uint8Array to base64 string. Works in Figma plugin main thread (no btoa). */
export function uint8ToBase64(bytes: Uint8Array): string {
  const len = bytes.length;
  const pad = len % 3;
  const parts: string[] = [];

  for (let i = 0; i < len - pad; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    parts.push(
      CHARS[(n >> 18) & 0x3f] +
      CHARS[(n >> 12) & 0x3f] +
      CHARS[(n >> 6) & 0x3f] +
      CHARS[n & 0x3f]
    );
  }

  if (pad === 1) {
    const n = bytes[len - 1];
    parts.push(CHARS[(n >> 2) & 0x3f] + CHARS[(n << 4) & 0x3f] + "==");
  } else if (pad === 2) {
    const n = (bytes[len - 2] << 8) | bytes[len - 1];
    parts.push(CHARS[(n >> 10) & 0x3f] + CHARS[(n >> 4) & 0x3f] + CHARS[(n << 2) & 0x3f] + "=");
  }

  return parts.join("");
}
