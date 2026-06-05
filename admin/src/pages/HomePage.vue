<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <div class="grid grid-cols-12 gap-4">
    <Card class="col-span-12 lg:col-span-4">
      <template #title>新闻</template>
      <div class="text-sm text-zinc-700">管理爬取到的小程序新闻，预览并一键设为 Hero/Banner。</div>
      <div class="mt-3">
        <Button type="primary" @click="router.push({ name: 'news-list' })">进入</Button>
      </div>
    </Card>

    <Card class="col-span-12 lg:col-span-4">
      <template #title>设备</template>
      <div class="text-sm text-zinc-700">查看固件设备上报（boot reports）与绑定用户。</div>
      <div class="mt-3">
        <Button type="primary" @click="router.push({ name: 'devices-list' })">进入</Button>
      </div>
    </Card>

    <Card class="col-span-12 lg:col-span-4">
      <template #title>用户</template>
      <div class="text-sm text-zinc-700">查看小程序用户与绑定设备关系。</div>
      <div class="mt-3">
        <Button type="primary" @click="router.push({ name: 'users-list' })">进入</Button>
      </div>
    </Card>
  </div>
</template>
