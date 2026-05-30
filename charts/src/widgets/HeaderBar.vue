<template>
  <div class="header">
    <div class="header-left">
      <div class="title">Telemetry Charts</div>
      <div v-if="showNav" class="nav">
        <RouterLink class="nav-link" to="/driver-telemetry">driver-telemetry</RouterLink>
        <RouterLink class="nav-link" to="/lap-trace">lap-trace</RouterLink>
        <RouterLink class="nav-link" to="/lap-times">lap-times</RouterLink>
        <RouterLink class="nav-link" to="/speeds">speeds</RouterLink>
        <RouterLink class="nav-link" to="/boxplot">boxplot</RouterLink>
      </div>
    </div>
    <div v-if="showNav" class="subtitle">API: {{ apiBase() }}</div>
  </div>
</template>

<script setup>
import { RouterLink } from "vue-router";
import { apiBase } from "../api";

defineProps({
  showNav: { type: Boolean, default: true }
});
</script>
