<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <Card>
    <template #title>页面不存在</template>
    <div class="text-sm text-zinc-300">找不到对应路由。</div>
    <div class="mt-3">
      <Button type="primary" @click="router.push({ name: 'dashboard' })">返回概览</Button>
    </div>
  </Card>
</template>

