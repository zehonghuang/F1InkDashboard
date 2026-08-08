<template>
  <CountryGlobe
    :size="size"
    :active-code="activeCode"
    :selected-code="selectedCode"
    :highlighted-countries="legacyHighlights"
    @hover-country="emit('hover-country', $event)"
    @select-country="emit('select-country', $event)"
  />
</template>

<script setup>
import { computed } from "vue";
import CountryGlobe from "./CountryGlobe.vue";

const props = defineProps({
  size: { type: Number, default: 283 },
  activeCode: { type: String, default: "" },
  selectedCode: { type: String, default: "" },
  items: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(["hover-country", "select-country"]);

const legacyHighlights = computed(() =>
  (Array.isArray(props.items) ? props.items : []).map((item) => ({
    code: item.code,
    value: item.value
  }))
);
</script>
