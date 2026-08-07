<template>
  <div v-if="showNav" class="header">
    <div class="header-left">
      <div class="title">F1 图表</div>
      <div class="nav">
        <RouterLink class="nav-link" to="/globe">全球地球</RouterLink>
        <RouterLink class="nav-link" to="/compare-throttle">油门对比</RouterLink>
        <RouterLink class="nav-link" to="/compare-brake">刹车对比</RouterLink>
        <RouterLink class="nav-link" to="/compare-speed">速度对比</RouterLink>
        <RouterLink class="nav-link" to="/driver-telemetry">单车手遥测</RouterLink>
        <RouterLink class="nav-link" to="/lap-trace">圈迹</RouterLink>
        <RouterLink class="nav-link" to="/lap-times">圈速</RouterLink>
        <RouterLink class="nav-link" to="/speeds">速度</RouterLink>
        <RouterLink class="nav-link" to="/boxplot">箱线图</RouterLink>
      </div>
    </div>
    <div class="subtitle">API: {{ apiBase() }}</div>
  </div>
</template>

<script setup>
import { RouterLink } from "vue-router";
import { apiBase } from "../api";

defineProps({
  showNav: { type: Boolean, default: true }
});
</script>
