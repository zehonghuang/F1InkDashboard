import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler
} from "chart.js";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend, Filler);

export function destroyIfAny(ref) {
  if (ref.current) {
    ref.current.destroy();
    ref.current = null;
  }
}

function baseOptions({ title }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(0,0,0,0.85)",
        titleColor: "#fff",
        bodyColor: "#fff"
      }
    },
    scales: {
      x: {
        grid: { color: "#e6e6e6" },
        ticks: { color: "#111" }
      },
      y: {
        grid: { color: "#e6e6e6" },
        ticks: { color: "#111" }
      }
    }
  };
}

function ds({ label, data, color, dash, pointStyle }) {
  return {
    label,
    data,
    borderColor: color,
    backgroundColor: "rgba(0,0,0,0)",
    borderWidth: 2,
    borderDash: dash || [],
    pointRadius: pointStyle === "dot" ? 2 : 0,
    pointHoverRadius: 3,
    tension: 0.25
  };
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

function sectorLinesPlugin(lines) {
  const safe = (Array.isArray(lines) ? lines : []).filter((x) => x && Number.isFinite(x.x));
  return {
    id: "sectorLines",
    afterDraw(chart) {
      if (!safe.length) return;
      const xScale = chart.scales?.x;
      if (!xScale) return;
      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.strokeStyle = "rgba(30,30,30,0.35)";
      ctx.fillStyle = "rgba(30,30,30,0.55)";
      ctx.lineWidth = 1;
      for (const ln of safe) {
        const px = xScale.getPixelForValue(ln.x);
        if (!Number.isFinite(px)) continue;
        ctx.beginPath();
        ctx.moveTo(px, chartArea.top);
        ctx.lineTo(px, chartArea.bottom);
        ctx.stroke();
        if (ln.label) {
          ctx.font = "12px sans-serif";
          ctx.fillText(String(ln.label), px + 4, chartArea.top + 14);
        }
      }
      ctx.restore();
    }
  };
}

export function renderLapTimeChart(canvas, labels, laps) {
  const dataLap = laps.map((x) => x.lap_duration ?? null);
  const s1 = laps.map((x) => x.duration_sector_1 ?? null);
  const s2 = laps.map((x) => x.duration_sector_2 ?? null);
  const s3 = laps.map((x) => x.duration_sector_3 ?? null);

  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        ds({ label: "Lap", data: dataLap, color: "#111111" }),
        ds({ label: "S1", data: s1, color: "#444444", dash: [8, 5] }),
        ds({ label: "S2", data: s2, color: "#777777", dash: [2, 4], pointStyle: "dot" }),
        ds({ label: "S3", data: s3, color: "#555555", dash: [10, 4, 2, 4] })
      ]
    },
    options: baseOptions({ title: "Lap Times" })
  });
}

export function renderSpeedChart(canvas, labels, laps) {
  const st = laps.map((x) => x.st_speed ?? null);
  const i1 = laps.map((x) => x.i1_speed ?? null);
  const i2 = laps.map((x) => x.i2_speed ?? null);

  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        ds({ label: "ST", data: st, color: "#111111" }),
        ds({ label: "I1", data: i1, color: "#444444", dash: [8, 5] }),
        ds({ label: "I2", data: i2, color: "#777777", dash: [2, 4], pointStyle: "dot" })
      ]
    },
    options: baseOptions({ title: "Speeds" })
  });
}

export function renderControlsChart(canvas, labels, items) {
  const th = items.map((x) => x.throttle_avg ?? null);
  const br = items.map((x) => x.brake_avg ?? null);

  const opt = baseOptions({ title: "Controls" });
  opt.scales.y.min = 0;
  opt.scales.y.max = 100;

  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        ds({ label: "Throttle", data: th, color: "#111111" }),
        ds({ label: "Brake", data: br, color: "#444444", dash: [8, 5] })
      ]
    },
    options: opt
  });
}

export function renderLapTraceChart(canvas, points) {
  const th = points.map((p) => ({ x: p.t_s, y: p.throttle ?? null }));
  const br = points.map((p) => ({ x: p.t_s, y: p.brake ?? null }));

  const opt = baseOptions({ title: "Lap Trace" });
  opt.scales.x = {
    type: "linear",
    title: { display: true, text: "t (s)", color: "#111" },
    grid: { color: "#e6e6e6" },
    ticks: {
      color: "#111",
      callback: (v) => formatLapClock(Number(v), 2),
      maxTicksLimit: 10
    }
  };
  opt.scales.y.min = 0;
  opt.scales.y.max = 100;
  opt.plugins.tooltip.callbacks = {
    title: (items) => {
      const it = items?.[0];
      const x = it?.parsed?.x;
      return x == null ? "" : formatLapClock(Number(x), 2);
    },
    label: (ctx) => {
      const y = ctx?.parsed?.y;
      const name = ctx?.dataset?.label || "";
      if (y == null || !Number.isFinite(y)) return `${name}: N/A`;
      return `${name}: ${Number(y).toFixed(0)}%`;
    }
  };

  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        ds({ label: "Throttle", data: th, color: "#111111" }),
        ds({ label: "Brake", data: br, color: "#444444", dash: [8, 5] })
      ]
    },
    options: opt
  });
}

export function renderLapControlsSeriesChart(canvas, payload) {
  const points = payload?.points || [];
  const n = points.length;

  const s1ms = payload?.s1_end_ms != null ? Number(payload.s1_end_ms) : null;
  const s2ms = payload?.s2_end_ms != null ? Number(payload.s2_end_ms) : null;
  const tend = payload?.t_end_ms != null ? Number(payload.t_end_ms) : null;

  const tAt = (idx) => {
    if (idx == null) return null;
    const p = points[idx];
    if (!p) return null;
    const t = p?.[0];
    const x = Number(t);
    return Number.isFinite(x) ? x : null;
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

  const lines = [
    { x: 1, label: "S1" },
    { x: 2, label: "S2" }
  ];

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
    const tMs = p?.[0];
    const x = toNormX(Number(tMs));
    if (x == null) continue;
    speed.push({ x, y: p?.[1] ?? null, t_s: Number(tMs) / 1000.0 });
    th.push({ x, y: p?.[2] ?? null, t_s: Number(tMs) / 1000.0 });
    br.push({ x, y: p?.[3] ?? null, t_s: Number(tMs) / 1000.0 });
  }

  const opt = baseOptions({ title: "Sectors (X=3 Sectors)" });
  opt.scales = {
    x: {
      type: "linear",
      min: 0,
      max: 3,
      grid: { color: "#e6e6e6" },
      ticks: {
        color: "#111",
        callback: (v) => {
          const x = Number(v);
          if (Math.abs(x - 0.5) < 0.001) return "S1";
          if (Math.abs(x - 1.5) < 0.001) return "S2";
          if (Math.abs(x - 2.5) < 0.001) return "S3";
          return "";
        },
        maxTicksLimit: 7
      }
    },
    ySpeed: {
      position: "left",
      grid: { color: "#e6e6e6" },
      ticks: { color: "#111" },
      title: { display: true, text: "Speed (km/h)", color: "#111" }
    },
    yCtrl: {
      position: "right",
      min: 0,
      max: 100,
      grid: { drawOnChartArea: false },
      ticks: { color: "#111" },
      title: { display: true, text: "Controls (%)", color: "#111" }
    }
  };
  opt.plugins.tooltip.callbacks = {
    title: (items) => {
      const it = items?.[0];
      const raw = it?.raw;
      const ts = raw?.t_s;
      if (ts == null || !Number.isFinite(ts)) return "";
      return formatLapClock(Number(ts), 2);
    },
    label: (ctx) => {
      const y = ctx?.parsed?.y;
      const name = ctx?.dataset?.label || "";
      if (y == null || !Number.isFinite(y)) return `${name}: N/A`;
      if (name === "Speed") return `${name}: ${Number(y).toFixed(0)} km/h`;
      return `${name}: ${Number(y).toFixed(0)}%`;
    }
  };

  return new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        { ...ds({ label: "Speed", data: speed, color: "#111111" }), yAxisID: "ySpeed" },
        { ...ds({ label: "Throttle", data: th, color: "#444444", dash: [8, 5] }), yAxisID: "yCtrl" },
        { ...ds({ label: "Brake", data: br, color: "#777777", dash: [2, 4], pointStyle: "dot" }), yAxisID: "yCtrl" }
      ]
    },
    options: opt,
    plugins: [sectorLinesPlugin(lines)]
  });
}

function normalizeHexColor(s) {
  if (!s) return null;
  const t = String(s).trim();
  if (!t) return null;
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(t)) return `#${t}`.toUpperCase();
  return null;
}

function boxplotPlugin() {
  return {
    id: "boxplot",
    afterDatasetsDraw(chart) {
      const ds0 = chart.data?.datasets?.[0];
      const items = Array.isArray(ds0?.data) ? ds0.data : [];
      if (!items.length) return;
      const xScale = chart.scales?.x;
      const yScale = chart.scales?.y;
      if (!xScale || !yScale) return;
      const { ctx } = chart;
      const boxW = Math.max(10, Math.min(28, (xScale.width / Math.max(2, items.length)) * 0.6));

      ctx.save();
      ctx.lineWidth = 2;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const x = xScale.getPixelForValue(i);
        if (!Number.isFinite(x)) continue;
        const q1 = Number(it?.q1);
        const q3 = Number(it?.q3);
        const med = Number(it?.median);
        const wl = Number(it?.whisker_low);
        const wh = Number(it?.whisker_high);
        if (![q1, q3, med, wl, wh].every((v) => Number.isFinite(v))) continue;

        const color = normalizeHexColor(it?.team_colour) || "#111111";
        const fill = "rgba(17,17,17,0.08)";

        const yQ1 = yScale.getPixelForValue(q1);
        const yQ3 = yScale.getPixelForValue(q3);
        const yMed = yScale.getPixelForValue(med);
        const yWL = yScale.getPixelForValue(wl);
        const yWH = yScale.getPixelForValue(wh);

        const left = x - boxW / 2;
        const top = Math.min(yQ1, yQ3);
        const h = Math.abs(yQ3 - yQ1);

        ctx.fillStyle = fill;
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.rect(left, top, boxW, Math.max(1, h));
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(left, yMed);
        ctx.lineTo(left + boxW, yMed);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(x, yQ3);
        ctx.lineTo(x, yWH);
        ctx.moveTo(x, yQ1);
        ctx.lineTo(x, yWL);
        ctx.stroke();

        const capW = boxW * 0.7;
        ctx.beginPath();
        ctx.moveTo(x - capW / 2, yWH);
        ctx.lineTo(x + capW / 2, yWH);
        ctx.moveTo(x - capW / 2, yWL);
        ctx.lineTo(x + capW / 2, yWL);
        ctx.stroke();
      }
      ctx.restore();
    }
  };
}

export function renderLapTimeBoxplotChart(canvas, labels, items) {
  const med = (items || []).map((x) => ({ x: x.label, y: x.median, ...x }));
  const bounds = (items || []).reduce(
    (acc, it) => {
      const lo0 = Number(it?.min);
      const lo1 = Number(it?.whisker_low);
      const hi0 = Number(it?.max);
      const hi1 = Number(it?.whisker_high);
      const lo = Number.isFinite(lo1) ? lo1 : lo0;
      const hi = Number.isFinite(hi1) ? hi1 : hi0;
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return acc;
      if (acc == null) return { lo, hi };
      return { lo: Math.min(acc.lo, lo), hi: Math.max(acc.hi, hi) };
    },
    null
  );

  const opt = baseOptions({ title: "Lap Time Boxplot" });
  opt.interaction = { mode: "nearest", intersect: true };
  opt.plugins.tooltip.callbacks = {
    title: (ctx) => String(ctx?.[0]?.label ?? ""),
    label: (ctx) => {
      const raw = ctx?.raw || {};
      const q1 = raw?.q1;
      const medV = raw?.median;
      const q3 = raw?.q3;
      const wl = raw?.whisker_low;
      const wh = raw?.whisker_high;
      const n = raw?.sample_count;
      if ([q1, medV, q3, wl, wh].every((v) => Number.isFinite(Number(v)))) {
        return `n=${n} wl=${Number(wl).toFixed(3)} q1=${Number(q1).toFixed(3)} med=${Number(medV).toFixed(
          3
        )} q3=${Number(q3).toFixed(3)} wh=${Number(wh).toFixed(3)}`;
      }
      return `median: ${Number(ctx.parsed.y).toFixed(3)} s`;
    }
  };
  opt.scales.x = {
    type: "category",
    labels,
    grid: { color: "#e6e6e6" },
    ticks: { color: "#111", maxRotation: 0, autoSkip: false }
  };
  opt.scales.y = {
    grid: { color: "#e6e6e6" },
    ticks: { color: "#111" },
    title: { display: true, text: "Lap Time (s)", color: "#111" }
  };
  if (bounds && Number.isFinite(bounds.lo) && Number.isFinite(bounds.hi) && bounds.hi > bounds.lo) {
    const range = bounds.hi - bounds.lo;
    const pad = range / 2;
    const minY = Math.max(0, bounds.lo - pad);
    const maxY = bounds.hi + pad;
    opt.scales.y.min = Math.floor(minY * 1000) / 1000;
    opt.scales.y.max = Math.ceil(maxY * 1000) / 1000;
  }

  return new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "median",
          data: med,
          parsing: { xAxisKey: "x", yAxisKey: "y" },
          showLine: false,
          pointRadius: 2,
          pointHoverRadius: 8,
          borderColor: "rgba(0,0,0,0)",
          backgroundColor: "rgba(0,0,0,0)"
        },
      ]
    },
    options: opt,
    plugins: [boxplotPlugin()]
  });
}
