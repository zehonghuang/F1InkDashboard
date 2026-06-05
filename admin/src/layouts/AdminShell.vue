<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeName = computed(() => {
  const n = String(route.name || '')
  if (n.startsWith('news')) return 'news'
  if (n.startsWith('devices')) return 'devices'
  if (n.startsWith('users')) return 'users'
  if (n.startsWith('settings')) return 'settings'
  return 'dashboard'
})

function onSelect(name: string) {
  switch (name) {
    case 'dashboard':
      router.push({ name: 'dashboard' })
      return
    case 'news':
      router.push({ name: 'news-list' })
      return
    case 'devices':
      router.push({ name: 'devices-list' })
      return
    case 'users':
      router.push({ name: 'users-list' })
      return
    case 'settings':
      router.push({ name: 'settings' })
      return
  }
}
</script>

<template>
  <Layout class="min-h-screen">
    <Sider
      class="border-r border-zinc-900 bg-zinc-950"
      hide-trigger
      :width="220"
    >
      <div class="px-4 py-4">
        <div class="text-sm font-semibold tracking-wide text-zinc-100">
          F1 Ink Admin
        </div>
        <div class="mt-1 text-xs text-zinc-400">免登录管理后台</div>
      </div>

      <Menu
        theme="dark"
        width="auto"
        :active-name="activeName"
        @on-select="onSelect"
      >
        <MenuItem name="dashboard">概览</MenuItem>
        <MenuItem name="news">新闻</MenuItem>
        <MenuItem name="devices">设备</MenuItem>
        <MenuItem name="users">用户</MenuItem>
        <MenuItem name="settings">设置</MenuItem>
      </Menu>
    </Sider>

    <Layout>
      <Header class="bg-white border-b border-zinc-200">
        <div class="h-full flex items-center justify-between px-4">
          <div class="text-sm text-zinc-900">
            {{ route.meta?.title || '' }}
          </div>
          <div class="flex items-center gap-2">
            <Button
              size="small"
              type="default"
              @click="router.push({ name: 'settings' })"
            >
              设置
            </Button>
          </div>
        </div>
      </Header>

      <Content class="p-4 bg-[#f5f7f9]">
        <router-view />
      </Content>
    </Layout>
  </Layout>
</template>
