export function parseIntOrNull(v) {
  if (v == null || v === "") return null;
  const x = parseInt(String(v), 10);
  return Number.isFinite(x) ? x : null;
}

export function parseThird(v) {
  return v === "1" || v === "2" || v === "3" ? v : "all";
}

export function parseBool(v) {
  return v === true || v === "1" || v === 1 || v === "true";
}

export function lapLabels(laps) {
  return (laps || []).map((x) => `L${x.lap_number}`);
}

export function sliceArrayByThird(arr, part) {
  if (!Array.isArray(arr)) return [];
  if (part !== "1" && part !== "2" && part !== "3") return arr;
  const n = arr.length;
  if (n < 6) return arr;
  const b1 = Math.floor(n / 3);
  const b2 = Math.floor((n * 2) / 3);
  if (part === "1") return arr.slice(0, Math.max(b1, 1));
  if (part === "2") return arr.slice(Math.max(b1, 0), Math.max(b2, b1 + 1));
  return arr.slice(Math.max(b2, 0));
}

export function fastestLapNumber(allLaps) {
  let bestLn = null;
  let bestDur = null;
  for (const it of allLaps || []) {
    if (it?.is_pit_out_lap === true) continue;
    const ln = it?.lap_number;
    const dur = it?.lap_duration;
    if (ln == null || dur == null) continue;
    const lnI = Number(ln);
    const durF = Number(dur);
    if (!Number.isFinite(lnI) || !Number.isFinite(durF) || durF <= 0) continue;
    if (bestDur == null || durF < bestDur || (durF === bestDur && lnI < bestLn)) {
      bestDur = durF;
      bestLn = lnI;
    }
  }
  return bestLn;
}
