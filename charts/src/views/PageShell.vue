<template>
  <div class="page">
    <HeaderBar :showNav="true" />
    <div class="container">
      <PageRenderer :pageKey="pageKey" :shareMode="false" />
    </div>
  </div>
</template>

<script setup>
import HeaderBar from "../widgets/HeaderBar.vue";
import PageRenderer from "../widgets/PageRenderer.vue";

defineProps({
  pageKey: { type: String, required: true }
});
</script>
