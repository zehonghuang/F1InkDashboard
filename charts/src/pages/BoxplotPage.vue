<template>
  <Card class="card">
    <div class="card-title">Boxplot</div>
    <div v-if="!shareMode" class="controls">
      <div class="control">
        <div class="label">Session Key</div>
        <InputNumber v-model="sessionKey" :min="1" style="width: 100%" placeholder="必填" />
      </div>
      <div class="control control-wide">
        <div class="label">Drivers</div>
        <Select v-model="driverNumbers" multiple filterable>
          <Option v-for="d in drivers" :key="d.driver_number" :value="d.driver_number">{{ d.name_acronym || d.driver_number }}</Option>
        </Select>
      </div>
      <div class="control">
        <div class="label">包含 pit out</div>
        <Checkbox v-model="includePitOut">include</Checkbox>
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
    <div ref="chartEl" class="chart chart-xl" />
    <div class="status">{{ status }}</div>
  </Card>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Button, Card, Checkbox, InputNumber, Option, Select } from "view-ui-plus";
import { fetchLapTimeBoxplot } from "../api";
import { renderLapTimeBoxplotChart } from "../charts";
import { useDrivers } from "../composables/useDrivers";
import { useShareLink } from "../composables/useShareLink";
import { parseBool, parseIntOrNull } from "../utils";

const props = defineProps({
  initState: { type: Object, default: null },
  shareMode: { type: Boolean, default: false }
});

const { items, load: loadDrivers } = useDrivers();
const drivers = computed(() => items.value || []);

const chartEl = ref(null);
let chart = null;

const sessionKey = ref(parseIntOrNull(props.initState?.session_key));
const driverNumbers = ref(Array.isArray(props.initState?.driver_numbers) ? props.initState.driver_numbers : []);
const includePitOut = ref(parseBool(props.initState?.include_pit_out));

const loading = ref(false);
const status = ref("");

const { copy } = useShareLink();

const load = async () => {
  loading.value = true;
  status.value = "加载中...";
  try {
    const sk = parseIntOrNull(sessionKey.value);
    if (!sk) throw new Error("boxplot 需要填写 session_key");
    const dns = (driverNumbers.value || []).map(parseIntOrNull).filter((x) => Number.isFinite(x) && x > 0);
    if (!dns.length) throw new Error("至少选择 1 个车手");
    const res = await fetchLapTimeBoxplot({ sessionKey: sk, driverNumbers: dns, includePitOut: includePitOut.value });
    const items = (res.items || []).map((x) => ({ ...x, label: x?.name_acronym || String(x?.driver_number ?? "") }));
    const labels = items.map((x) => x.label);
    if (chart) chart.dispose();
    chart = renderLapTimeBoxplotChart(chartEl.value, labels, items);
    status.value = `boxplot session_key=${sk} drivers=${items.length}`;
  } catch (e) {
    status.value = String(e?.message || e);
  } finally {
    loading.value = false;
  }
};

const genLink = async () => {
  try {
    const url = await copy({
      page: "boxplot",
      session_key: parseIntOrNull(sessionKey.value),
      driver_numbers: (driverNumbers.value || []).map(parseIntOrNull).filter((x) => Number.isFinite(x) && x > 0),
      include_pit_out: includePitOut.value ? 1 : 0
    });
    status.value = `链接已复制：${url}`;
  } catch (e) {
    status.value = String(e?.message || e);
  }
};

onMounted(async () => {
  await loadDrivers();
  if (sessionKey.value == null && drivers.value.length && drivers.value[0]?.latest_session_key) sessionKey.value = drivers.value[0].latest_session_key;
  if (!driverNumbers.value.length && drivers.value.length) driverNumbers.value = drivers.value.slice(0, 5).map((x) => x.driver_number);
  await load();
});

onBeforeUnmount(() => {
  if (chart) chart.dispose();
  chart = null;
});
</script>
