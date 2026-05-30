import * as echarts from "echarts";

function normalizeHexColor(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`.toUpperCase();
  return null;
}

function hexToRgba(hex, alpha) {
  const h = normalizeHexColor(hex);
  if (!h) return null;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function initChart(dom) {
  const chart = echarts.init(dom, "dark");
  const onResize = () => chart.resize();
  window.addEventListener("resize", onResize);
  return {
    setOption: (opt) => chart.setOption(opt, { notMerge: true, lazyUpdate: false }),
    dispose: () => {
      window.removeEventListener("resize", onResize);
      chart.dispose();
    }
  };
}

export function destroyIfAny(ref) {
  if (!ref?.current) return;
  ref.current.dispose();
  ref.current = null;
}

function formatLapClock(seconds, fracDigits = 2) {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const sign = seconds < 0 ? "-" : "";
  const s = Math.abs(seconds);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const remFixed = rem.toFixed(fracDigits);
  const [secStr, fracStr = ""] = remFixed.split(".");
  const sec2 = secStr.padStart(2, "0");
  if (fracDigits <= 0) return `${sign}${m}:${sec2}`;
  return `${sign}${m}:${sec2}.${fracStr}`;
}

function lineSeries({ name, data, color, dashed, yAxisIndex, encodeExtra }) {
  return {
    type: "line",
    name,
    data,
    showSymbol: false,
    connectNulls: false,
    emphasis: { focus: "series" },
    lineStyle: { width: 2, color, type: dashed ? "dashed" : "solid" },
    itemStyle: { color },
    yAxisIndex: yAxisIndex ?? 0,
    encode: encodeExtra || undefined
  };
}

function axisPointerTooltip() {
  return {
    trigger: "axis",
    axisPointer: { type: "cross" },
    backgroundColor: "rgba(0,0,0,0.85)",
    borderWidth: 0,
    textStyle: { color: "#fff" }
  };
}

function baseOption() {
  return {
    backgroundColor: "transparent",
    textStyle: { color: "rgba(255,255,255,0.85)" },
    grid: { left: 56, right: 22, top: 34, bottom: 46 },
    legend: { top: 0, left: 0, textStyle: { color: "rgba(255,255,255,0.7)" } },
    xAxis: {
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.28)" } },
      axisLabel: { color: "rgba(255,255,255,0.72)" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } }
    },
    yAxis: {
      axisLine: { lineStyle: { color: "rgba(255,255,255,0.28)" } },
      axisLabel: { color: "rgba(255,255,255,0.72)" },
      splitLine: { lineStyle: { color: "rgba(255,255,255,0.08)" } },
      nameTextStyle: { color: "rgba(255,255,255,0.6)" }
    }
  };
}

export function renderLapTimeChart(container, labels, laps, { driverColor } = {}) {
  const c0 = normalizeHexColor(driverColor) || "#ffffff";
  const c1 = hexToRgba(c0, 0.72) || "rgba(255,255,255,0.72)";
  const c2 = hexToRgba(c0, 0.55) || "rgba(255,255,255,0.55)";
  const c3 = hexToRgba(c0, 0.62) || "rgba(255,255,255,0.62)";
  const dataLap = (laps || []).map((x) => (x?.lap_duration ?? null));
  const s1 = (laps || []).map((x) => (x?.duration_sector_1 ?? null));
  const s2 = (laps || []).map((x) => (x?.duration_sector_2 ?? null));
  const s3 = (laps || []).map((x) => (x?.duration_sector_3 ?? null));

  const inst = initChart(container);
  inst.setOption({
    ...baseOption(),
    tooltip: axisPointerTooltip(),
    xAxis: { type: "category", data: labels || [], axisTick: { alignWithLabel: true } },
    yAxis: { type: "value", name: "s", scale: true },
    series: [
      lineSeries({ name: "Lap", data: dataLap, color: c0 }),
      lineSeries({ name: "S1", data: s1, color: c1, dashed: true }),
      lineSeries({ name: "S2", data: s2, color: c2, dashed: true }),
      lineSeries({ name: "S3", data: s3, color: c3, dashed: true })
    ]
  });
  return inst;
}

export function renderSpeedChart(container, labels, laps, { driverColor } = {}) {
  const c0 = normalizeHexColor(driverColor) || "#ffffff";
  const c1 = hexToRgba(c0, 0.72) || "rgba(255,255,255,0.72)";
  const c2 = hexToRgba(c0, 0.55) || "rgba(255,255,255,0.55)";
  const st = (laps || []).map((x) => (x?.st_speed ?? null));
  const i1 = (laps || []).map((x) => (x?.i1_speed ?? null));
  const i2 = (laps || []).map((x) => (x?.i2_speed ?? null));

  const inst = initChart(container);
  inst.setOption({
    ...baseOption(),
    tooltip: axisPointerTooltip(),
    xAxis: { type: "category", data: labels || [], axisTick: { alignWithLabel: true } },
    yAxis: { type: "value", name: "km/h", scale: true },
    series: [
      lineSeries({ name: "ST", data: st, color: c0 }),
      lineSeries({ name: "I1", data: i1, color: c1, dashed: true }),
      lineSeries({ name: "I2", data: i2, color: c2, dashed: true })
    ]
  });
  return inst;
}

export function renderLapTraceChart(container, points, { driverColor } = {}) {
  const c0 = normalizeHexColor(driverColor) || "#ffffff";
  const c1 = hexToRgba(c0, 0.72) || "rgba(255,255,255,0.72)";
  const th = (points || []).map((p) => [p?.t_s ?? null, p?.throttle ?? null]);
  const br = (points || []).map((p) => [p?.t_s ?? null, p?.brake ?? null]);

  const inst = initChart(container);
  inst.setOption({
    ...baseOption(),
    tooltip: {
      ...axisPointerTooltip(),
      valueFormatter: (v) => (v == null || !Number.isFinite(Number(v)) ? "N/A" : `${Number(v).toFixed(0)}%`)
    },
    xAxis: {
      type: "value",
      name: "t",
      axisLabel: { formatter: (v) => formatLapClock(Number(v), 2) }
    },
    yAxis: { type: "value", min: 0, max: 100, name: "%" },
    series: [
      lineSeries({ name: "Throttle", data: th, color: c0 }),
      lineSeries({ name: "Brake", data: br, color: c1, dashed: true })
    ]
  });
  return inst;
}

export function renderLapControlsSeriesChart(container, payload, { driverColor } = {}) {
  const c0 = normalizeHexColor(driverColor) || "#ffffff";
  const c1 = hexToRgba(c0, 0.72) || "rgba(255,255,255,0.72)";
  const c2 = hexToRgba(c0, 0.55) || "rgba(255,255,255,0.55)";
  const points = payload?.points || [];
  const n = points.length;

  const s1ms = payload?.s1_end_ms != null ? Number(payload.s1_end_ms) : null;
  const s2ms = payload?.s2_end_ms != null ? Number(payload.s2_end_ms) : null;
  const tend = payload?.t_end_ms != null ? Number(payload.t_end_ms) : null;

  const tAt = (idx) => {
    if (idx == null) return null;
    const p = points[idx];
    if (!p) return null;
    const t = Number(p?.[0]);
    return Number.isFinite(t) ? t : null;
  };

  let t1 = Number.isFinite(s1ms) ? s1ms : null;
  let t2 = Number.isFinite(s2ms) ? s2ms : null;
  let t3 = Number.isFinite(tend) ? tend : null;

  if (t1 == null && Number.isFinite(payload?.s1_end_i)) t1 = tAt(Number(payload.s1_end_i));
  if (t2 == null && Number.isFinite(payload?.s2_end_i)) t2 = tAt(Number(payload.s2_end_i));
  if (t3 == null && n > 0) t3 = tAt(n - 1);

  if (n > 0 && (t1 == null || t2 == null || t3 == null || !(t1 > 0) || !(t2 > t1) || !(t3 > t2))) {
    t1 = tAt(Math.floor(n / 3)) ?? 0;
    t2 = tAt(Math.floor((n * 2) / 3)) ?? t1 + 1;
    t3 = tAt(n - 1) ?? t2 + 1;
  }

  const toNormX = (tMs) => {
    if (tMs == null || !Number.isFinite(tMs)) return null;
    const t = Number(tMs);
    const a0 = 0;
    const a1 = Number(t1 ?? 0);
    const a2 = Number(t2 ?? 0);
    const a3 = Number(t3 ?? 0);

    if (t < a1) {
      const den = Math.max(1, a1 - a0);
      return 0 + Math.max(0, Math.min(1, (t - a0) / den));
    }
    if (t < a2) {
      const den = Math.max(1, a2 - a1);
      return 1 + Math.max(0, Math.min(1, (t - a1) / den));
    }
    const den = Math.max(1, a3 - a2);
    return 2 + Math.max(0, Math.min(1, (t - a2) / den));
  };

  const speed = [];
  const th = [];
  const br = [];
  for (const p of points) {
    const tMs = Number(p?.[0]);
    const x = toNormX(tMs);
    if (x == null) continue;
    const ts = tMs / 1000.0;
    speed.push([x, p?.[1] ?? null, ts]);
    th.push([x, p?.[2] ?? null, ts]);
    br.push([x, p?.[3] ?? null, ts]);
  }

  const inst = initChart(container);
  inst.setOption({
    ...baseOption(),
    grid: { left: 60, right: 60, top: 34, bottom: 46 },
    tooltip: {
      ...axisPointerTooltip(),
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const first = items[0];
        const ts = first?.value?.[2];
        const head = ts == null || !Number.isFinite(Number(ts)) ? "" : formatLapClock(Number(ts), 2);
        const lines = [];
        if (head) lines.push(head);
        for (const it of items) {
          const name = it?.seriesName || "";
          const y = it?.value?.[1];
          if (y == null || !Number.isFinite(Number(y))) lines.push(`${name}: N/A`);
          else if (name === "Speed") lines.push(`${name}: ${Number(y).toFixed(0)} km/h`);
          else lines.push(`${name}: ${Number(y).toFixed(0)}%`);
        }
        return lines.join("<br/>");
      }
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 3,
      axisLabel: {
        formatter: (v) => {
          const x = Number(v);
          if (Math.abs(x - 0.5) < 0.001) return "S1";
          if (Math.abs(x - 1.5) < 0.001) return "S2";
          if (Math.abs(x - 2.5) < 0.001) return "S3";
          return "";
        }
      }
    },
    yAxis: [
      { type: "value", name: "km/h", scale: true },
      { type: "value", name: "%", min: 0, max: 100, scale: true }
    ],
    series: [
      {
        ...lineSeries({ name: "Speed", data: speed, color: c0, yAxisIndex: 0 }),
        markLine: {
          symbol: "none",
          lineStyle: { color: "rgba(255,255,255,0.22)", width: 1 },
          label: { show: false },
          data: [{ xAxis: 1 }, { xAxis: 2 }]
        }
      },
      lineSeries({ name: "Throttle", data: th, color: c1, dashed: true, yAxisIndex: 1 }),
      lineSeries({ name: "Brake", data: br, color: c2, dashed: true, yAxisIndex: 1 })
    ]
  });
  return inst;
}

export function renderLapTimeBoxplotChart(container, labels, items) {
  const safeItems = Array.isArray(items) ? items : [];
  const data = safeItems
    .map((it) => {
      const wl0 = Number(it?.whisker_low);
      const wh0 = Number(it?.whisker_high);
      const min0 = Number(it?.min);
      const max0 = Number(it?.max);
      const wl = Number.isFinite(wl0) ? wl0 : min0;
      const wh = Number.isFinite(wh0) ? wh0 : max0;
      const q1 = Number(it?.q1);
      const med = Number(it?.median);
      const q3 = Number(it?.q3);
      if (![wl, q1, med, q3, wh].every((v) => Number.isFinite(v))) return null;
      const border = normalizeHexColor(it?.team_colour) || "#111111";
      return {
        value: [wl, q1, med, q3, wh],
        itemStyle: { borderColor: border, color: "rgba(17,17,17,0.08)" },
        raw: it
      };
    })
    .filter(Boolean);

  const inst = initChart(container);
  inst.setOption({
    ...baseOption(),
    grid: { left: 60, right: 22, top: 34, bottom: 72 },
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(0,0,0,0.85)",
      borderWidth: 0,
      textStyle: { color: "#fff" },
      formatter: (p) => {
        const raw = p?.data?.raw || {};
        const v = Array.isArray(p?.value) ? p.value : [];
        const label = p?.name ?? "";
        const wl = v?.[0];
        const q1 = v?.[1];
        const med = v?.[2];
        const q3 = v?.[3];
        const wh = v?.[4];
        const n = raw?.sample_count;
        if ([wl, q1, med, q3, wh].every((x) => Number.isFinite(Number(x)))) {
          return `${label}<br/>n=${n} wl=${Number(wl).toFixed(3)} q1=${Number(q1).toFixed(3)} med=${Number(med).toFixed(
            3
          )} q3=${Number(q3).toFixed(3)} wh=${Number(wh).toFixed(3)}`;
        }
        return String(label);
      }
    },
    xAxis: { type: "category", data: labels || [], axisLabel: { interval: 0 } },
    yAxis: { type: "value", name: "s", scale: true },
    series: [{ type: "boxplot", name: "Lap Time", data }]
  });
  return inst;
}

export function renderSectorCompareChart(container, { series, metric }) {
  const m = String(metric || "").toLowerCase();
  const isPct = m === "throttle" || m === "brake";
  const yName = m === "speed" ? "km/h" : "%";

  const inst = initChart(container);
  inst.setOption({
    ...baseOption(),
    grid: { left: 60, right: 24, top: 34, bottom: 46 },
    tooltip: {
      ...axisPointerTooltip(),
      formatter: (params) => {
        const items = Array.isArray(params) ? params : [params];
        const p0 = items[0];
        const x = p0?.value?.[0];
        const sec = x < 1 ? 1 : x < 2 ? 2 : 3;
        const pct = Math.round((Number(x) - (sec - 1)) * 100);
        const head = `S${sec} ${Math.max(0, Math.min(100, pct))}%`;
        const lines = [head];
        for (const it of items) {
          const name = it?.seriesName || "";
          const y = it?.value?.[1];
          if (y == null || !Number.isFinite(Number(y))) {
            lines.push(`${name}: N/A`);
            continue;
          }
          if (isPct) lines.push(`${name}: ${Math.round(Number(y))}%`);
          else lines.push(`${name}: ${Math.round(Number(y))} km/h`);
        }
        return lines.join("<br/>");
      }
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 3,
      axisLabel: {
        formatter: (v) => {
          const x = Number(v);
          if (x === 0) return "S1";
          if (x === 1) return "S2";
          if (x === 2) return "S3";
          return "";
        }
      }
    },
    yAxis: isPct ? { type: "value", min: 0, max: 100, name: yName } : { type: "value", name: yName, scale: true },
    series: (Array.isArray(series) ? series : []).map((s) => ({
      type: "line",
      name: s?.name || "",
      data: s?.data || [],
      showSymbol: false,
      smooth: false,
      emphasis: { focus: "series" },
      lineStyle: { width: 1.8, color: s?.color || "#ffffff" },
      itemStyle: { color: s?.color || "#ffffff" },
      markLine: {
        silent: true,
        symbol: "none",
        lineStyle: { color: "rgba(255,255,255,0.12)", type: "dashed", width: 1 },
        label: { show: false },
        data: [{ xAxis: 1 }, { xAxis: 2 }]
      }
    }))
  });
  return inst;
}
