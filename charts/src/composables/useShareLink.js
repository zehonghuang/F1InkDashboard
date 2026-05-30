import { encodeShareHash } from "../share";

async function copyTextToClipboard(text) {
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "-9999px";
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

export function useShareLink() {
  const build = (state) => {
    const hash = encodeShareHash(state);
    const base = String(import.meta.env.BASE_URL || "/");
    const prefix = base.endsWith("/") ? base : `${base}/`;
    return `${location.origin}${prefix}#${hash}`;
  };

  const copy = async (state) => {
    const url = build(state);
    await copyTextToClipboard(url);
    return url;
  };

  return { build, copy };
}
