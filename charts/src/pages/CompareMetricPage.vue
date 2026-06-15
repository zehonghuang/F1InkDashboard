<template>
  <Card class="card compare-telemetry-card">
    <div class="session-title">
      <div class="session-title-main">{{ titleMain }}</div>
      <div class="session-title-sub">{{ titleSub }}</div>
    </div>

    <div class="telemetry-toolbar">
      <div class="telemetry-toolbar-text">
        <div class="telemetry-toolbar-kicker">{{ title }}</div>
        <div class="telemetry-toolbar-value">{{ selectedDriversText }}</div>
      </div>
      <div v-if="!shareMode" class="telemetry-toolbar-actions">
        <Button type="primary" :loading="loading" @click="load">加载</Button>
        <Button :disabled="loading" @click="genLink">生成链接</Button>
      </div>
    </div>

    <div v-if="!shareMode" class="telemetry-controls-panel">
      <div class="controls telemetry-controls">
        <div class="control">
          <div class="label">Session Key</div>
          <InputNumber v-model="sessionKey" :min="1" style="width: 100%" placeholder="必填" />
        </div>
        <div class="control control-wide">
          <div class="label">车手</div>
          <Select v-model="driverNumbers" multiple filterable>
            <Option v-for="d in drivers" :key="d.driver_number" :value="d.driver_number">{{ d.name_acronym || d.driver_number }}</Option>
          </Select>
        </div>
      </div>
    </div>

    <div class="telemetry-hint">{{ telemetryLapInfo }}</div>

    <div v-if="telemetrySectorCards.length || telemetryInsightText" class="telemetry-summary-panel">
      <div class="telemetry-summary-head">
        <div class="telemetry-summary-title">遥测摘要</div>
        <div v-if="telemetryInsightTitle" class="telemetry-summary-compare">{{ telemetryInsightTitle }}</div>
      </div>

      <div v-if="telemetrySectorCards.length" class="telemetry-sector-grid">
        <div v-for="item in telemetrySectorCards" :key="item.sector" class="telemetry-sector-card" :style="item.accentStyle">
          <div class="telemetry-sector-name">{{ item.sector }}</div>
          <div class="telemetry-sector-driver">{{ item.label }}</div>
          <div class="telemetry-sector-value">{{ item.value }}</div>
          <div class="telemetry-sector-label">{{ item.metricLabel }}</div>
        </div>
      </div>

      <div v-if="telemetryInsightText" class="telemetry-insight">
        <div class="telemetry-insight-title">关键观察</div>
        <div class="telemetry-insight-text">{{ telemetryInsightText }}</div>
      </div>
    </div>

    <div class="telemetry-chart-shell">
      <div ref="chartEl" class="chart chart-telemetry" />
    </div>

    <div class="status" :class="{ 'status-error': statusTone === 'error' }">{{ status }}</div>
  </Card>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Button, Card, InputNumber, Option, Select } from "view-ui-plus";
import { fetchMpTelemetrySectorControls } from "../api";
import { renderSectorCompareChart } from "../charts";
import { useDrivers } from "../composables/useDrivers";
import { useSessionMeta } from "../composables/useSessionMeta";
import { useShareLink } from "../composables/useShareLink";
import { parseIntOrNull } from "../utils";

const props = defineProps({
  metric: { type: String, required: true },
  page: { type: String, required: true },
  title: { type: String, required: true },
  initState: { type: Object, default: null },
  shareMode: { type: Boolean, default: false }
});

const { items, load: loadDrivers } = useDrivers();
const drivers = computed(() => items.value || []);

const chartEl = ref(null);
let chart = null;

const sessionKey = ref(parseIntOrNull(props.initState?.session_key));
const driverNumbers = ref(Array.isArray(props.initState?.driver_numbers) ? props.initState.driver_numbers : []);

const loading = ref(false);
const status = ref("");
const statusTone = ref("info");
const telemetryLapInfo = ref("选择车手后查看最快圈与扇区走势");
const telemetrySectorCards = ref([]);
const telemetryInsightTitle = ref("");
const telemetryInsightText = ref("");

const { copy } = useShareLink();
const { titleMain, titleSub } = useSessionMeta(sessionKey, { pageTitle: props.title });

const metaByDn = computed(() => {
  const m = {};
  for (const it of drivers.value || []) {
    const dn = Number(it?.driver_number);
    if (!dn) continue;
    m[dn] = { label: it?.name_acronym || String(dn), color: it?.team_colour || "#ffffff" };
  }
  return m;
});

const selectedDriversText = computed(() => {
  const labels = (driverNumbers.value || [])
    .map((dn) => metaByDn.value[Number(dn)]?.label || String(dn))
    .filter(Boolean);
  if (!labels.length) return "请选择车手";
  return labels.join(" / ");
});

function normalizeHexColor(s) {
  if (!s) return null;
  const text = String(s).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text}`.toUpperCase();
  return null;
}

function hexToRgba(hex, alpha) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "";
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getMetricMeta(metric) {
  if (metric === "speed") return { label: "速度", unit: "km/h", digits: 0 };
  if (metric === "brake") return { label: "刹车比", unit: "%", digits: 0 };
  return { label: "油门比", unit: "%", digits: 0 };
}

function formatMetricValue(metric, value, signed = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "--";
  const meta = getMetricMeta(metric);
  const abs = Math.abs(n);
  const text = meta.digits > 0 ? abs.toFixed(meta.digits) : String(Math.round(abs));
  const sign = signed ? (n > 0 ? "+" : n < 0 ? "-" : "") : "";
  return `${sign}${text} ${meta.unit}`;
}

function parseLapClock(text) {
  if (!text) return Number.NaN;
  const raw = String(text).trim();
  const m = raw.match(/^(\d+):(\d{1,2})(?:\.(\d+))?$/);
  if (!m) return Number(raw);
  const minutes = Number(m[1]);
  const seconds = Number(m[2]);
  const fraction = m[3] ? Number(`0.${m[3]}`) : 0;
  return minutes * 60 + seconds + fraction;
}

function formatLapDelta(seconds, digits = 3) {
  if (!Number.isFinite(seconds)) return "--";
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  const abs = Math.abs(seconds);
  const minutes = Math.floor(abs / 60);
  const remain = abs - minutes * 60;
  const [sec, frac = ""] = remain.toFixed(digits).split(".");
  return `${sign}${minutes}:${sec.padStart(2, "0")}${digits > 0 ? `.${frac}` : ""}`;
}

function averageMetricPairs(pairs, start, end) {
  if (!Array.isArray(pairs) || !pairs.length) return Number.NaN;
  let sum = 0;
  let count = 0;
  const includeLast = end >= 3;
  for (const pair of pairs) {
    const x = Number(pair?.[0]);
    const y = Number(pair?.[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < start) continue;
    if (includeLast ? x > end : x >= end) continue;
    sum += y;
    count += 1;
  }
  return count ? sum / count : Number.NaN;
}

function buildTelemetryAnalysis(metric, stats) {
  const list = Array.isArray(stats) ? stats : [];
  const sectorCards = [];

  for (let i = 0; i < 3; i += 1) {
    let leader = null;
    for (const item of list) {
      const avg = Number(item?.sectorAverages?.[i]);
      if (!Number.isFinite(avg)) continue;
      if (!leader || avg > leader.avg) leader = { avg, label: item.label, color: item.color };
    }
    if (!leader) continue;
    const accentStyle = leader.color
      ? {
          background: hexToRgba(leader.color, 0.16),
          borderColor: hexToRgba(leader.color, 0.22)
        }
      : {};
    sectorCards.push({
      sector: `S${i + 1}`,
      label: leader.label || "-",
      metricLabel: "扇区峰值",
      value: formatMetricValue(metric, leader.avg),
      accentStyle
    });
  }

  if (!list.length) return { title: "", text: "", sectorCards };

  const meta = getMetricMeta(metric);
  if (list.length === 1) {
    const only = list[0];
    let peakIndex = 0;
    let peakValue = Number(only.overallAvg);
    for (let i = 0; i < 3; i += 1) {
      const value = Number(only?.sectorAverages?.[i]);
      if (Number.isFinite(value) && (!Number.isFinite(peakValue) || value > peakValue)) {
        peakIndex = i;
        peakValue = value;
      }
    }
    return {
      title: only.label || "",
      text: `${meta.label} ${formatMetricValue(metric, only.overallAvg)} · 扇区峰值 S${peakIndex + 1}`,
      sectorCards
    };
  }

  const [a, b] = list;
  let maxGapIndex = 0;
  let maxGapValue = Number(a?.sectorAverages?.[0]) - Number(b?.sectorAverages?.[0]);
  for (let i = 1; i < 3; i += 1) {
    const diff = Number(a?.sectorAverages?.[i]) - Number(b?.sectorAverages?.[i]);
    if (Math.abs(diff) > Math.abs(maxGapValue)) {
      maxGapIndex = i;
      maxGapValue = diff;
    }
  }

  const parts = [
    `${meta.label} ${formatMetricValue(metric, Number(a?.overallAvg) - Number(b?.overallAvg), true)}`,
    `最大差距 S${maxGapIndex + 1} ${formatMetricValue(metric, maxGapValue, true)}`
  ];
  const lapDelta = Number(a?.lapTimeSeconds) - Number(b?.lapTimeSeconds);
  if (Number.isFinite(lapDelta)) parts.push(`圈速差 ${formatLapDelta(lapDelta, 3)}`);

  return {
    title: `${a?.label || "-"} vs ${b?.label || "-"}`,
    text: parts.join(" · "),
    sectorCards
  };
}

const load = async () => {
  loading.value = true;
  status.value = "加载中...";
  statusTone.value = "info";
  try {
    const sk = parseIntOrNull(sessionKey.value);
    if (!sk) throw new Error("session_key 必填");
    const dns = (driverNumbers.value || []).map(parseIntOrNull).filter((x) => Number.isFinite(x) && x > 0);
    if (!dns.length) throw new Error("至少选择 1 个车手");

    const rows = await Promise.all(
      dns.map(async (dn) => {
        const data = await fetchMpTelemetrySectorControls({ sessionKey: sk, driverNumber: dn, maxPoints: 1200 });
        const points = Array.isArray(data?.points) ? data.points : [];
        const out = [];
        for (const p of points) {
          const x = Number(p?.x);
          const y = Number(p?.[props.metric]);
          if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
          out.push([x, y]);
        }
        const meta = metaByDn.value[dn] || { label: String(dn), color: "#ffffff" };
        const lap = data?.lap_time ? ` ${data.lap_time}` : "";
        return {
          dn,
          label: meta.label,
          lapTime: data?.lap_time || "",
          lapTimeSeconds: parseLapClock(data?.lap_time),
          name: `${meta.label}${lap}`,
          color: meta.color || "#ffffff",
          data: out
        };
      })
    );

    const analysis = buildTelemetryAnalysis(
      props.metric,
      rows.map((row) => ({
        label: row.label,
        color: row.color,
        lapTimeSeconds: row.lapTimeSeconds,
        sectorAverages: [
          averageMetricPairs(row.data, 0, 1),
          averageMetricPairs(row.data, 1, 2),
          averageMetricPairs(row.data, 2, 3)
        ],
        overallAvg: averageMetricPairs(row.data, 0, 3)
      }))
    );
    telemetrySectorCards.value = analysis.sectorCards;
    telemetryInsightTitle.value = analysis.title;
    telemetryInsightText.value = analysis.text;
    telemetryLapInfo.value = rows.length
      ? `最快圈：${rows.map((row) => `${row.label}${row.lapTime ? ` ${row.lapTime}` : ""}`).join(" / ")}`
      : "选择车手后查看最快圈与扇区走势";

    if (chart) chart.dispose();
    chart = renderSectorCompareChart(chartEl.value, { series: rows, metric: props.metric });
    status.value = `session_key=${sk} drivers=${rows.length}`;
  } catch (e) {
    telemetrySectorCards.value = [];
    telemetryInsightTitle.value = "";
    telemetryInsightText.value = "";
    status.value = String(e?.message || e);
    statusTone.value = "error";
  } finally {
    loading.value = false;
  }
};

const genLink = async () => {
  try {
    const url = await copy({
      page: props.page,
      session_key: parseIntOrNull(sessionKey.value),
      driver_numbers: (driverNumbers.value || []).map(parseIntOrNull).filter((x) => Number.isFinite(x) && x > 0)
    });
    status.value = `链接已复制：${url}`;
    statusTone.value = "info";
  } catch (e) {
    status.value = String(e?.message || e);
    statusTone.value = "error";
  }
};

onMounted(async () => {
  await loadDrivers();
  if (sessionKey.value == null && drivers.value.length && drivers.value[0]?.latest_session_key) sessionKey.value = drivers.value[0].latest_session_key;
  if (!driverNumbers.value.length && drivers.value.length) driverNumbers.value = drivers.value.slice(0, 3).map((x) => x.driver_number);
  await load();
});

onBeforeUnmount(() => {
  if (chart) chart.dispose();
  chart = null;
});
</script>
