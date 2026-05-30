<template>
  <Card class="card">
    <div class="session-title">
      <div class="session-title-main">{{ titleMain }}</div>
      <div class="session-title-sub">{{ titleSub }}</div>
    </div>
    <div class="card-title">{{ title }}</div>
    <div v-if="!shareMode" class="controls">
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
      <div class="control">
        <div class="label">&nbsp;</div>
        <Button type="primary" long :loading="loading" @click="load">加载</Button>
      </div>
      <div class="control">
        <div class="label">&nbsp;</div>
        <Button long :disabled="loading" @click="genLink">生成链接</Button>
      </div>
    </div>
    <div ref="chartEl" class="chart chart-tall" />
    <div class="status">{{ status }}</div>
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

const load = async () => {
  loading.value = true;
  status.value = "加载中...";
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
        return { dn, name: `${meta.label}${lap}`, color: meta.color || "#ffffff", data: out };
      })
    );

    if (chart) chart.dispose();
    chart = renderSectorCompareChart(chartEl.value, { series: rows, metric: props.metric });
    status.value = `session_key=${sk} drivers=${rows.length}`;
  } catch (e) {
    status.value = String(e?.message || e);
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
  } catch (e) {
    status.value = String(e?.message || e);
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
