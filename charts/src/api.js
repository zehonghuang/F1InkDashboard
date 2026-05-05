const DEFAULT_BASE = "http://127.0.0.1:8008";

export function apiBase() {
  const fromEnv = import.meta.env.VITE_API_BASE;
  return (fromEnv || DEFAULT_BASE).replace(/\/+$/, "");
}

export async function fetchAvailableDrivers() {
  const r = await fetch(`${apiBase()}/api/v1/telemetry/laps/available`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "backend error");
  return j.items || [];
}

export async function fetchLaps({ driverNumber, sessionKey }) {
  const qs = new URLSearchParams();
  qs.set("driver_number", String(driverNumber));
  if (sessionKey) qs.set("session_key", String(sessionKey));
  const r = await fetch(`${apiBase()}/api/v1/telemetry/laps?${qs.toString()}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "backend error");
  return j;
}

export async function fetchLapControls({ driverNumber, sessionKey }) {
  const qs = new URLSearchParams();
  qs.set("driver_number", String(driverNumber));
  if (sessionKey) qs.set("session_key", String(sessionKey));
  const r = await fetch(`${apiBase()}/api/v1/telemetry/lap_controls?${qs.toString()}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "backend error");
  return j;
}

export async function fetchLapTrace({ driverNumber, sessionKey, lapNumber, maxPoints }) {
  const qs = new URLSearchParams();
  qs.set("driver_number", String(driverNumber));
  if (sessionKey) qs.set("session_key", String(sessionKey));
  qs.set("lap_number", String(lapNumber));
  if (maxPoints) qs.set("max_points", String(maxPoints));
  const r = await fetch(`${apiBase()}/api/v1/telemetry/lap_trace?${qs.toString()}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "backend error");
  return j;
}
