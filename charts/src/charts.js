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
