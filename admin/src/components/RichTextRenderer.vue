<script setup lang="ts">
import type { MpNewsRichTextNode } from '@/api/mpNews'
import RichTextNode from '@/components/RichTextNode.vue'

defineProps<{ nodes: MpNewsRichTextNode[]; baseUrl?: string }>()
</script>

<template>
  <div class="space-y-2 text-sm text-zinc-200">
    <RichTextNode v-for="(n, idx) in nodes" :key="idx" :node="n" :base-url="baseUrl" />
  </div>
</template>
