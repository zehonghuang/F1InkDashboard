<template>
  <div v-if="share" class="page">
    <HeaderBar :showNav="false" />
    <div class="container">
      <PageRenderer :pageKey="share.page" :initState="share" :shareMode="true" />
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import HeaderBar from "../widgets/HeaderBar.vue";
import PageRenderer from "../widgets/PageRenderer.vue";
import { decodeShareHash, normalizeHashSegment } from "../share";

const router = useRouter();

const share = ref(null);

const sync = () => {
  const seg = normalizeHashSegment(location.hash);
  if (!seg) {
    share.value = null;
    return;
  }
  try {
    share.value = decodeShareHash(seg);
  } catch (e) {
    share.value = null;
  }
};

onMounted(() => {
  sync();
  window.addEventListener("hashchange", sync);
  if (!share.value) router.replace("/compare-throttle");
});

onBeforeUnmount(() => {
  window.removeEventListener("hashchange", sync);
});
</script>
