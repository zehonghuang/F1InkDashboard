const { pickXAxis } = require("./telemetryService")

function buildXAxis(samples) {
  const x = pickXAxis(samples)
  const xData = (samples || []).map((s) => (x.key === "distance" ? s.distance ?? 0 : s.t ?? 0))
  return { xKey: x.key, xData, xUnit: x.unit }
}

function buildPowerOption(samples) {
  const { xKey, xData, xUnit } = buildXAxis(samples)
  return {
    animation: false,
    grid: { left: 44, right: 44, top: 24, bottom: 32 },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: xData,
      name: xKey === "distance" ? `距离 (${xUnit})` : `时间 (${xUnit})`,
      axisLabel: { formatter: (v) => String(Math.round(Number(v))) }
    },
    yAxis: [
      { type: "value", name: "速度(km/h)", axisLabel: { formatter: (v) => String(Math.round(Number(v))) } },
      { type: "value", name: "转速(rpm)", axisLabel: { formatter: (v) => String(Math.round(Number(v))) } }
    ],
    series: [
      {
        name: "速度",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        data: (samples || []).map((s) => s.speed ?? 0)
      },
      {
        name: "转速",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        yAxisIndex: 1,
        data: (samples || []).map((s) => s.rpm ?? 0)
      }
    ]
  }
}

function buildPedalOption(samples) {
  const { xKey, xData, xUnit } = buildXAxis(samples)
  return {
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: 32 },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: xData,
      name: xKey === "distance" ? `距离 (${xUnit})` : `时间 (${xUnit})`,
      axisLabel: { formatter: (v) => String(Math.round(Number(v))) }
    },
    yAxis: {
      type: "value",
      name: "%",
      min: 0,
      max: 100,
      axisLabel: { formatter: (v) => `${Math.round(Number(v))}` }
    },
    series: [
      {
        name: "油门",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        areaStyle: {},
        data: (samples || []).map((s) => s.throttle ?? 0)
      },
      {
        name: "刹车",
        type: "line",
        smooth: 0.25,
        showSymbol: false,
        areaStyle: {},
        data: (samples || []).map((s) => s.brake ?? 0)
      }
    ]
  }
}

function buildGearOption(samples) {
  const { xKey, xData, xUnit } = buildXAxis(samples)
  return {
    animation: false,
    grid: { left: 44, right: 16, top: 24, bottom: 32 },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: xData,
      name: xKey === "distance" ? `距离 (${xUnit})` : `时间 (${xUnit})`,
      axisLabel: { formatter: (v) => String(Math.round(Number(v))) }
    },
    yAxis: {
      type: "value",
      name: "档位",
      min: 0,
      max: 8,
      interval: 1,
      axisLabel: { formatter: (v) => String(Math.round(Number(v))) }
    },
    series: [
      {
        name: "档位",
        type: "line",
        step: "middle",
        showSymbol: false,
        data: (samples || []).map((s) => s.gear ?? 0)
      }
    ]
  }
}

module.exports = {
  buildPowerOption,
  buildPedalOption,
  buildGearOption
}

