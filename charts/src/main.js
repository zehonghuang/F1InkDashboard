import "./styles.css";
import { fetchAvailableDrivers, fetchLaps, fetchLapTrace, fetchLapControlsSeries, fetchLapTimeBoxplot, apiBase } from "./api";
import {
  destroyIfAny,
  renderLapTimeChart,
  renderSpeedChart,
  renderLapTraceChart,
  renderLapControlsSeriesChart,
  renderLapTimeBoxplotChart
} from "./charts";

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "className") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, String(v));
  }
  for (const c of children) e.appendChild(c);
  return e;
}

function option(value, label) {
  const o = document.createElement("option");
  o.value = String(value);
  o.textContent = String(label);
  return o;
}

function lapLabels(laps) {
  return laps.map((x) => `L${x.lap_number}`);
}

function lapThirdLabel(v) {
  if (v === "1") return "1/3";
  if (v === "2") return "2/3";
  if (v === "3") return "3/3";
  return "all";
}

function sliceArrayByThird(arr, part) {
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

function fastestLapNumber(allLaps) {
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

async function bootstrap() {
  const root = document.getElementById("app");
  const lapChartRef = { current: null };
  const speedChartRef = { current: null };
  const traceChartRef = { current: null };
  const seriesChartRef = { current: null };
  const boxplotChartRef = { current: null };

  const title = el("div", { className: "title", text: "Telemetry Dashboard (Laps)" });
  const subtitle = el("div", { className: "subtitle", text: `API: ${apiBase()}` });
  const header = el("div", { className: "header" }, [title, subtitle]);

  const driverSelect = el("select");
  const boxplotDriverSelect = el("select", { multiple: true, size: "8" });
  const sessionInput = el("input", { type: "number", placeholder: "留空=latest" });
  const lapThirdSelect = el("select");
  lapThirdSelect.appendChild(option("all", "全部"));
  lapThirdSelect.appendChild(option("1", "前 1/3"));
  lapThirdSelect.appendChild(option("2", "中 1/3"));
  lapThirdSelect.appendChild(option("3", "后 1/3"));
  const lapSelect = el("select");
  const loadBtn = el("button", { text: "加载" });
  const boxplotBtn = el("button", { text: "加载箱线图" });
  const boxplotSelectAllBtn = el("button", { text: "全选" });
  const boxplotClearBtn = el("button", { text: "清空" });
  const includePitOut = el("input", { type: "checkbox" });
  const statusText = el("div", { className: "subtitle", text: "" });

  const controls = el("div", { className: "controls" }, [
    el("div", {}, [el("label", { text: "Driver" }), driverSelect]),
    el("div", {}, [el("label", { text: "Session Key (可选)" }), sessionInput]),
    el("div", {}, [el("label", { text: "Lap 范围" }), lapThirdSelect]),
    el("div", {}, [el("label", { text: "查看圈" }), lapSelect]),
    el("div", {}, [el("label", { text: " " }), loadBtn]),
    el("div", {}, [el("label", { text: "Boxplot Drivers (Ctrl/Shift 多选)" }), boxplotDriverSelect]),
    el("div", {}, [el("label", { text: " " }), el("div", {}, [boxplotSelectAllBtn, boxplotClearBtn])]),
    el("div", {}, [el("label", { text: "包含 pit out" }), includePitOut]),
    el("div", {}, [el("label", { text: " " }), boxplotBtn]),
    el("div", {}, [el("label", { text: "状态" }), statusText])
  ]);

  const lapCanvas = el("canvas");
  const speedCanvas = el("canvas");
  const traceCanvas = el("canvas");
  const seriesCanvas = el("canvas");
  const boxplotCanvas = el("canvas");
  const lapWrap = el("div", { style: "height: 340px;" }, [lapCanvas]);
  const speedWrap = el("div", { style: "height: 340px;" }, [speedCanvas]);
  const traceWrap = el("div", { style: "height: 340px;" }, [traceCanvas]);
  const seriesWrap = el("div", { style: "height: 340px;" }, [seriesCanvas]);
  const boxplotWrap = el("div", { style: "height: 420px;" }, [boxplotCanvas]);

  const lapLegend = el("div", { className: "legend" }, [
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line" }), el("span", { text: "Lap" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dash" }), el("span", { text: "S1" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dot" }), el("span", { text: "S2" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dashdot" }), el("span", { text: "S3" })])
  ]);

  const speedLegend = el("div", { className: "legend" }, [
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line" }), el("span", { text: "ST" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dash" }), el("span", { text: "I1" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dot" }), el("span", { text: "I2" })])
  ]);

  const traceLegend = el("div", { className: "legend" }, [
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line" }), el("span", { text: "Throttle" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dash" }), el("span", { text: "Brake" })])
  ]);

  const seriesLegend = el("div", { className: "legend" }, [
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line" }), el("span", { text: "Speed" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dash" }), el("span", { text: "Throttle" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dot" }), el("span", { text: "Brake" })]),
    el("span", { className: "legend-item" }, [el("span", { className: "sample-line dashdot" }), el("span", { text: "S1/S2/S3" })])
  ]);

  const lapCard = el("div", { className: "card" }, [el("h3", { text: "Lap Times (s)" }), lapWrap, lapLegend]);
  const speedCard = el("div", { className: "card" }, [el("h3", { text: "Speeds (km/h)" }), speedWrap, speedLegend]);
  const traceCard = el("div", { className: "card" }, [
    el("h3", { text: "Throttle / Brake Trace (per Lap)" }),
    traceWrap,
    traceLegend
  ]);
  const seriesCard = el("div", { className: "card" }, [
    el("h3", { text: "S1/S2/S3 (X=Sector, 默认最快圈)" }),
    seriesWrap,
    seriesLegend
  ]);
  const boxplotCard = el("div", { className: "card" }, [el("h3", { text: "Lap Time Boxplot (s)" }), boxplotWrap]);
  const grid = el("div", { className: "grid" }, [lapCard, speedCard, traceCard, seriesCard, boxplotCard]);

  const container = el("div", { className: "container" }, [header, controls, grid]);
  root.appendChild(container);

  function setStatus(s) {
    statusText.textContent = s;
  }

  function refreshLapOptions(laps, part) {
    const sliced = sliceArrayByThird(laps, part);
    lapSelect.innerHTML = "";
    for (const it of sliced) {
      const ln = it.lap_number;
      if (ln == null) continue;
      lapSelect.appendChild(option(ln, `L${ln}`));
    }
    return sliced;
  }

  async function load() {
    const driverNumber = parseInt(driverSelect.value, 10);
    const sk = sessionInput.value ? parseInt(sessionInput.value, 10) : null;
    const lapThird = lapThirdSelect.value || "all";
    const lapNumber = lapSelect.value ? parseInt(lapSelect.value, 10) : null;
    destroyIfAny(lapChartRef);
    destroyIfAny(speedChartRef);
    destroyIfAny(traceChartRef);
    destroyIfAny(seriesChartRef);
    loadBtn.disabled = true;
    setStatus("加载中...");
    try {
      const lapsData = await fetchLaps({ driverNumber, sessionKey: sk });
      const allLaps = lapsData.laps || [];
      const prev = lapSelect.value ? parseInt(lapSelect.value, 10) : null;
      const sliced = refreshLapOptions(allLaps, lapThird);
      const fastLn = fastestLapNumber(allLaps);
      const hasPrev = prev != null && Array.from(lapSelect.options).some((o) => parseInt(o.value, 10) === prev);
      const hasFast = fastLn != null && Array.from(lapSelect.options).some((o) => parseInt(o.value, 10) === fastLn);
      if (hasPrev) lapSelect.value = String(prev);
      else if (hasFast) lapSelect.value = String(fastLn);
      else if (lapSelect.options.length) lapSelect.value = lapSelect.options[0].value;

      const lapNo = lapNumber || (lapSelect.value ? parseInt(lapSelect.value, 10) : null);
      const laps = sliceArrayByThird(allLaps, lapThird);
      const labels = lapLabels(laps);
      lapChartRef.current = renderLapTimeChart(lapCanvas, labels, laps);
      speedChartRef.current = renderSpeedChart(speedCanvas, labels, laps);
      const resolvedSk = lapsData.session_key ?? sk;

      if (lapNo != null && Number.isFinite(lapNo)) {
        const trace = await fetchLapTrace({ driverNumber, sessionKey: resolvedSk, lapNumber: lapNo, maxPoints: 600 });
        traceChartRef.current = renderLapTraceChart(traceCanvas, trace.points || []);
        const series = await fetchLapControlsSeries({ driverNumber, sessionKey: resolvedSk, lapNumber: lapNo, maxPoints: 900 });
        seriesChartRef.current = renderLapControlsSeriesChart(seriesCanvas, series.payload);
      }
      setStatus(
        `driver=${driverNumber} session_key=${lapsData.session_key ?? "N/A"} laps=${laps.length}/${allLaps.length} range=${lapThirdLabel(
          lapThird
        )}`
      );
    } catch (e) {
      setStatus(String(e?.message || e));
    } finally {
      loadBtn.disabled = false;
    }
  }

  async function loadBoxplot() {
    const sk = sessionInput.value ? parseInt(sessionInput.value, 10) : null;
    const driverNumbers = Array.from(boxplotDriverSelect.selectedOptions || [])
      .map((o) => parseInt(o.value, 10))
      .filter((x) => Number.isFinite(x) && x > 0);
    destroyIfAny(boxplotChartRef);
    boxplotBtn.disabled = true;
    setStatus("加载箱线图中...");
    try {
      if (sk == null || !Number.isFinite(sk) || sk <= 0) {
        throw new Error("boxplot 需要填写 session_key");
      }
      if (!driverNumbers.length) {
        throw new Error("boxplot 至少选择 1 个车手");
      }
      const res = await fetchLapTimeBoxplot({ sessionKey: sk, driverNumbers, includePitOut: includePitOut.checked });
      const items = (res.items || []).map((x) => ({
        ...x,
        label: x?.name_acronym || String(x?.driver_number ?? "")
      }));
      const labels = items.map((x) => x.label);
      boxplotChartRef.current = renderLapTimeBoxplotChart(boxplotCanvas, labels, items);
      setStatus(`boxplot session_key=${sk} drivers=${items.length}`);
    } catch (e) {
      setStatus(String(e?.message || e));
    } finally {
      boxplotBtn.disabled = false;
    }
  }

  loadBtn.addEventListener("click", load);
  lapThirdSelect.addEventListener("change", load);
  lapSelect.addEventListener("change", load);
  boxplotBtn.addEventListener("click", loadBoxplot);
  boxplotDriverSelect.addEventListener("change", loadBoxplot);
  includePitOut.addEventListener("change", loadBoxplot);
  boxplotSelectAllBtn.addEventListener("click", () => {
    for (const o of Array.from(boxplotDriverSelect.options || [])) o.selected = true;
    loadBoxplot();
  });
  boxplotClearBtn.addEventListener("click", () => {
    for (const o of Array.from(boxplotDriverSelect.options || [])) o.selected = false;
    destroyIfAny(boxplotChartRef);
    setStatus("boxplot 已清空");
  });

  setStatus("读取 driver 列表...");
  try {
    const items = await fetchAvailableDrivers();
    driverSelect.innerHTML = "";
    boxplotDriverSelect.innerHTML = "";
    for (const it of items) {
      const dn = it.driver_number;
      driverSelect.appendChild(option(dn, dn));
      boxplotDriverSelect.appendChild(option(dn, dn));
    }
    if (items.length) {
      driverSelect.value = String(items[0].driver_number);
      if (items[0].latest_session_key) sessionInput.value = String(items[0].latest_session_key);
      for (let i = 0; i < Math.min(5, boxplotDriverSelect.options.length); i++) {
        boxplotDriverSelect.options[i].selected = true;
      }
      setStatus("就绪");
      await load();
      await loadBoxplot();
    } else {
      setStatus("MySQL 里没有 openf1_laps 数据");
    }
  } catch (e) {
    setStatus(String(e?.message || e));
  }
}

bootstrap();
