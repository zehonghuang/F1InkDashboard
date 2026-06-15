<template>
  <Card class="card">
    <div class="session-title">
      <div class="session-title-main">{{ titleMain }}</div>
      <div class="session-title-sub">{{ titleSub }}</div>
    </div>
    <div class="card-title">速度</div>
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
          <div class="label">Lap 范围</div>
          <Select v-model="lapThird">
            <Option value="all">全部</Option>
            <Option value="1">前 1/3</Option>
            <Option value="2">中 1/3</Option>
            <Option value="3">后 1/3</Option>
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
      <div ref="chartEl" class="chart" />
    </div>
    <div class="status">{{ status }}</div>
  </Card>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Button, Card, InputNumber, Option, Select } from "view-ui-plus";
import { fetchLaps } from "../api";
import { renderSpeedChart } from "../charts";
import { useDrivers } from "../composables/useDrivers";
import { useSessionMeta } from "../composables/useSessionMeta";
import { useShareLink } from "../composables/useShareLink";
import { lapLabels, parseIntOrNull, parseThird, sliceArrayByThird } from "../utils";

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
const lapThird = ref(parseThird(props.initState?.lap_third));

const loading = ref(false);
const status = ref("");

const { copy } = useShareLink();
const { titleMain, titleSub } = useSessionMeta(sessionKey, { pageTitle: "速度" });

const driverColor = computed(() => {
  const dn = parseIntOrNull(driverNumber.value);
  if (!dn) return null;
  const d = (drivers.value || []).find((x) => x?.driver_number === dn);
  return d?.team_colour || null;
});

const load = async () => {
  loading.value = true;
  status.value = "加载中...";
  try {
    const dn = parseIntOrNull(driverNumber.value);
    if (!dn) throw new Error("driver 不能为空");
    const sk = parseIntOrNull(sessionKey.value);
    const res = await fetchLaps({ driverNumber: dn, sessionKey: sk });
    if (sessionKey.value == null && res.session_key) sessionKey.value = res.session_key;
    const allLaps = res.laps || [];
    const laps = sliceArrayByThird(allLaps, parseThird(lapThird.value));
    const labels = lapLabels(laps);
    if (chart) chart.dispose();
    chart = renderSpeedChart(chartEl.value, labels, laps, { driverColor: driverColor.value });
    status.value = `driver=${dn} session_key=${res.session_key ?? "N/A"} laps=${laps.length}/${allLaps.length}`;
  } catch (e) {
    status.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
};

const genLink = async () => {
  try {
    const url = await copy({
      page: "speeds",
      driver_number: parseIntOrNull(driverNumber.value),
      session_key: parseIntOrNull(sessionKey.value),
      lap_third: parseThird(lapThird.value)
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

onBeforeUnmount(() => {
  if (chart) chart.dispose();
  chart = null;
});
</script>
