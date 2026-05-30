function base64UrlEncodeUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeUtf8(s) {
  const b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeShareHash(state) {
  return base64UrlEncodeUtf8(JSON.stringify({ v: 1, ...state }));
}

export function decodeShareHash(hash) {
  const raw = base64UrlDecodeUtf8(hash);
  const obj = JSON.parse(raw);
  if (!obj || obj.v !== 1 || typeof obj.page !== "string") return null;
  return obj;
}

export function normalizeHashSegment(rawHash) {
  const seg = String(rawHash || "").replace(/^#\/?/, "");
  return seg || "";
}
