<template>
  <Card class="card">
    <div class="session-title">
      <div class="session-title-main">{{ titleMain }}</div>
      <div class="session-title-sub">{{ titleSub }}</div>
    </div>
    <div class="card-title">圈迹</div>
    <div v-if="!shareMode" class="controls-panel">
      <div class="controls">
        <div class="control">
          <div class="label">车手</div>
          <Select v-model="driverNumber" filterable>
            <Option v-for="d in drivers" :key="d.driver_number" :value="d.driver_number">{{ d.name_acronym || d.driver_number }}</Option>
          </Select>
        </div>
        <div class="control">
          <div class="label">Session Key</div>
          <InputNumber v-model="sessionKey" :min="0" style="width: 100%" placeholder="留空=latest" />
        </div>
        <div class="control">
          <div class="label">圈次</div>
          <Select v-model="lapNumber" filterable>
            <Option v-for="ln in lapOptions" :key="ln" :value="ln">L{{ ln }}</Option>
          </Select>
        </div>
        <div class="control">
          <div class="label">&nbsp;</div>
          <Button type="primary" long :loading="loading" @click="load">加载</Button>
        </div>
        <div class="control">
          <div class="label">&nbsp;</div>
          <Button long :disabled="loading" @click="genLink">生成链接</Button>
        </div>
      </div>
    </div>
    <div class="chart-shell">
      <div ref="chartEl" class="chart chart-tall" />
    </div>
    <div class="status">{{ status }}</div>
  </Card>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { Button, Card, InputNumber, Option, Select } from "view-ui-plus";
import { fetchLaps, fetchLapTrace } from "../api";
import { renderLapTraceChart } from "../charts";
import { useDrivers } from "../composables/useDrivers";
import { useSessionMeta } from "../composables/useSessionMeta";
import { useShareLink } from "../composables/useShareLink";
import { fastestLapNumber, parseIntOrNull } from "../utils";

const props = defineProps({
  initState: { type: Object, default: null },
  shareMode: { type: Boolean, default: false }
});

const { items, load: loadDrivers } = useDrivers();
const drivers = computed(() => items.value || []);

const chartEl = ref(null);
let chart = null;

const driverNumber = ref(parseIntOrNull(props.initState?.driver_number));
const sessionKey = ref(parseIntOrNull(props.initState?.session_key));
const lapNumber = ref(parseIntOrNull(props.initState?.lap_number));

const lapOptions = ref([]);
const loading = ref(false);
const status = ref("");

const { copy } = useShareLink();
const { titleMain, titleSub } = useSessionMeta(sessionKey, { pageTitle: "圈迹" });

const driverColor = computed(() => {
  const dn = parseIntOrNull(driverNumber.value);
  if (!dn) return null;
  const d = (drivers.value || []).find((x) => x?.driver_number === dn);
  return d?.team_colour || null;
});

const refreshLaps = async () => {
  const dn = parseIntOrNull(driverNumber.value);
  if (!dn) return null;
  const sk = parseIntOrNull(sessionKey.value);
  const res = await fetchLaps({ driverNumber: dn, sessionKey: sk });
  const allLaps = res.laps || [];
  lapOptions.value = allLaps.map((x) => x.lap_number).filter((x) => x != null);
  const fast = fastestLapNumber(allLaps);
  if (!lapNumber.value) lapNumber.value = parseIntOrNull(props.initState?.lap_number) ?? fast ?? lapOptions.value?.[0] ?? null;
  return { res, allLaps };
};

const load = async () => {
  loading.value = true;
  status.value = "加载中...";
  try {
    const dn = parseIntOrNull(driverNumber.value);
    if (!dn) throw new Error("driver 不能为空");
    const lapsInfo = await refreshLaps();
    const resolvedSk = lapsInfo?.res?.session_key ?? parseIntOrNull(sessionKey.value);
    if (sessionKey.value == null && resolvedSk) sessionKey.value = resolvedSk;
    const ln = parseIntOrNull(lapNumber.value);
    if (!ln) throw new Error("lap 不能为空");
    const trace = await fetchLapTrace({ driverNumber: dn, sessionKey: resolvedSk, lapNumber: ln, maxPoints: 900 });
    if (chart) chart.dispose();
    chart = renderLapTraceChart(chartEl.value, trace.points || [], { driverColor: driverColor.value });
    status.value = `driver=${dn} session_key=${resolvedSk ?? "N/A"} lap=${ln} points=${(trace.points || []).length}`;
  } catch (e) {
    status.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
};

const genLink = async () => {
  try {
    const url = await copy({
      page: "lap-trace",
      driver_number: parseIntOrNull(driverNumber.value),
      session_key: parseIntOrNull(sessionKey.value),
      lap_number: parseIntOrNull(lapNumber.value)
    });
    status.value = `链接已复制：${url}`;
  } catch (e) {
    status.value = String(e?.message || e);
  }
};

onMounted(async () => {
  await loadDrivers();
  if (!driverNumber.value && drivers.value.length) driverNumber.value = drivers.value[0].driver_number;
  if (sessionKey.value == null && drivers.value.length && drivers.value[0]?.latest_session_key) sessionKey.value = drivers.value[0].latest_session_key;
  await load();
});

watch([driverNumber, sessionKey], () => {
  if (props.shareMode) return;
  lapNumber.value = null;
  load();
});

watch(
  () => lapNumber.value,
  () => {
    if (props.shareMode) return;
    load();
  }
);

onBeforeUnmount(() => {
  if (chart) chart.dispose();
  chart = null;
});
</script>
