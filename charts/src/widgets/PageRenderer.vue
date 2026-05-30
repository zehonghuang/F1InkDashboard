<template>
  <DriverTelemetryPage v-if="pageKey === 'driver-telemetry'" :initState="initState" :shareMode="shareMode" />
  <CompareMetricPage
    v-else-if="pageKey === 'compare-throttle'"
    metric="throttle"
    page="compare-throttle"
    title="油门对比"
    :initState="initState"
    :shareMode="shareMode"
  />
  <CompareMetricPage
    v-else-if="pageKey === 'compare-brake'"
    metric="brake"
    page="compare-brake"
    title="刹车对比"
    :initState="initState"
    :shareMode="shareMode"
  />
  <CompareMetricPage
    v-else-if="pageKey === 'compare-speed'"
    metric="speed"
    page="compare-speed"
    title="速度对比"
    :initState="initState"
    :shareMode="shareMode"
  />
  <LapTracePage v-else-if="pageKey === 'lap-trace'" :initState="initState" :shareMode="shareMode" />
  <LapTimesPage v-else-if="pageKey === 'lap-times'" :initState="initState" :shareMode="shareMode" />
  <SpeedsPage v-else-if="pageKey === 'speeds'" :initState="initState" :shareMode="shareMode" />
  <BoxplotPage v-else-if="pageKey === 'boxplot'" :initState="initState" :shareMode="shareMode" />
  <Card v-else class="card">
    <div class="subtitle">unknown page</div>
  </Card>
</template>

<script setup>
import { Card } from "view-ui-plus";
import DriverTelemetryPage from "../pages/DriverTelemetryPage.vue";
import CompareMetricPage from "../pages/CompareMetricPage.vue";
import LapTracePage from "../pages/LapTracePage.vue";
import LapTimesPage from "../pages/LapTimesPage.vue";
import SpeedsPage from "../pages/SpeedsPage.vue";
import BoxplotPage from "../pages/BoxplotPage.vue";

defineProps({
  pageKey: { type: String, required: true },
  initState: { type: Object, default: null },
  shareMode: { type: Boolean, default: false }
});
</script>
