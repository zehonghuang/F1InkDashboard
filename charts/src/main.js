import "./styles.css";
import { fetchAvailableDrivers, fetchLaps, fetchLapTrace, apiBase } from "./api";
import { destroyIfAny, renderLapTimeChart, renderSpeedChart, renderLapTraceChart } from "./charts";

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

async function bootstrap() {
  const root = document.getElementById("app");
  const lapChartRef = { current: null };
  const speedChartRef = { current: null };
  const traceChartRef = { current: null };

  const title = el("div", { className: "title", text: "Telemetry Dashboard (Laps)" });
  const subtitle = el("div", { className: "subtitle", text: `API: ${apiBase()}` });
  const header = el("div", { className: "header" }, [title, subtitle]);

  const driverSelect = el("select");
  const sessionInput = el("input", { type: "number", placeholder: "留空=latest" });
  const lapThirdSelect = el("select");
  lapThirdSelect.appendChild(option("all", "全部"));
  lapThirdSelect.appendChild(option("1", "前 1/3"));
  lapThirdSelect.appendChild(option("2", "中 1/3"));
  lapThirdSelect.appendChild(option("3", "后 1/3"));
  const lapSelect = el("select");
  const loadBtn = el("button", { text: "加载" });
  const statusText = el("div", { className: "subtitle", text: "" });

  const controls = el("div", { className: "controls" }, [
    el("div", {}, [el("label", { text: "Driver" }), driverSelect]),
    el("div", {}, [el("label", { text: "Session Key (可选)" }), sessionInput]),
    el("div", {}, [el("label", { text: "Lap 范围" }), lapThirdSelect]),
    el("div", {}, [el("label", { text: "查看圈" }), lapSelect]),
    el("div", {}, [el("label", { text: " " }), loadBtn]),
    el("div", {}, [el("label", { text: "状态" }), statusText])
  ]);

  const lapCanvas = el("canvas");
  const speedCanvas = el("canvas");
  const traceCanvas = el("canvas");
  const lapWrap = el("div", { style: "height: 340px;" }, [lapCanvas]);
  const speedWrap = el("div", { style: "height: 340px;" }, [speedCanvas]);
  const traceWrap = el("div", { style: "height: 340px;" }, [traceCanvas]);

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

  const lapCard = el("div", { className: "card" }, [el("h3", { text: "Lap Times (s)" }), lapWrap, lapLegend]);
  const speedCard = el("div", { className: "card" }, [el("h3", { text: "Speeds (km/h)" }), speedWrap, speedLegend]);
  const traceCard = el("div", { className: "card" }, [
    el("h3", { text: "Throttle / Brake Trace (per Lap)" }),
    traceWrap,
    traceLegend
  ]);
  const grid = el("div", { className: "grid" }, [lapCard, speedCard, traceCard]);

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
    if (!lapSelect.value && lapSelect.options.length) {
      lapSelect.value = lapSelect.options[0].value;
    }
  }

  async function load() {
    const driverNumber = parseInt(driverSelect.value, 10);
    const sk = sessionInput.value ? parseInt(sessionInput.value, 10) : null;
    const lapThird = lapThirdSelect.value || "all";
    const lapNumber = lapSelect.value ? parseInt(lapSelect.value, 10) : null;
    destroyIfAny(lapChartRef);
    destroyIfAny(speedChartRef);
    destroyIfAny(traceChartRef);
    loadBtn.disabled = true;
    setStatus("加载中...");
    try {
      const lapsData = await fetchLaps({ driverNumber, sessionKey: sk });
      const allLaps = lapsData.laps || [];
      refreshLapOptions(allLaps, lapThird);
      const lapNo = lapNumber || (lapSelect.value ? parseInt(lapSelect.value, 10) : null);
      const laps = sliceArrayByThird(allLaps, lapThird);
      const labels = lapLabels(laps);
      lapChartRef.current = renderLapTimeChart(lapCanvas, labels, laps);
      speedChartRef.current = renderSpeedChart(speedCanvas, labels, laps);

      if (lapNo != null && Number.isFinite(lapNo)) {
        const trace = await fetchLapTrace({ driverNumber, sessionKey: sk, lapNumber: lapNo, maxPoints: 600 });
        traceChartRef.current = renderLapTraceChart(traceCanvas, trace.points || []);
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

  loadBtn.addEventListener("click", load);
  lapThirdSelect.addEventListener("change", load);
  lapSelect.addEventListener("change", load);

  setStatus("读取 driver 列表...");
  try {
    const items = await fetchAvailableDrivers();
    driverSelect.innerHTML = "";
    for (const it of items) {
      const dn = it.driver_number;
      driverSelect.appendChild(option(dn, dn));
    }
    if (items.length) {
      driverSelect.value = String(items[0].driver_number);
      if (items[0].latest_session_key) sessionInput.value = String(items[0].latest_session_key);
      setStatus("就绪");
      await load();
    } else {
      setStatus("MySQL 里没有 openf1_laps 数据");
    }
  } catch (e) {
    setStatus(String(e?.message || e));
  }
}

bootstrap();
