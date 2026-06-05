<script setup lang="ts">
import { adminBind, adminUnbind, fetchAdminUserDetail, type AdminUserItem } from '@/api/admin'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const userId = computed(() => Number(route.params.user_id))

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const item = ref<AdminUserItem | null>(null)

const bindDeviceId = ref('')

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchAdminUserDetail(userId.value)
    item.value = res.item
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

async function bind() {
  const did = bindDeviceId.value.trim()
  if (!did) {
    errorText.value = 'device_id_required'
    return
  }
  saving.value = true
  errorText.value = ''
  try {
    await adminBind({ user_id: userId.value, device_id: did })
    bindDeviceId.value = ''
    await load()
  } catch (e: any) {
    errorText.value = String(e?.message || e || '绑定失败')
  } finally {
    saving.value = false
  }
}

async function unbind() {
  saving.value = true
  errorText.value = ''
  try {
    await adminUnbind({ user_id: userId.value })
    await load()
  } catch (e: any) {
    errorText.value = String(e?.message || e || '解绑失败')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <Card>
      <template #title>用户详情</template>
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs text-zinc-400">UserID：{{ userId }}</div>
        <Button size="small" type="default" @click="router.push({ name: 'users-list' })">返回列表</Button>
      </div>
      <Alert v-if="errorText" type="error" show-icon class="mt-3">{{ errorText }}</Alert>
    </Card>

    <Card :loading="loading">
      <template #title>用户信息</template>
      <div v-if="item" class="grid grid-cols-12 gap-4 text-sm">
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">昵称</div>
          <div class="text-zinc-100">{{ item.nick_name || '-' }}</div>
        </div>
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">UnionID</div>
          <div class="text-zinc-100 break-all">{{ item.unionid || '-' }}</div>
        </div>
        <div class="col-span-12">
          <div class="text-zinc-400">OpenID</div>
          <div class="text-zinc-100 break-all">{{ item.openid }}</div>
        </div>
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">Created</div>
          <div class="text-zinc-100">{{ item.created_at || '-' }}</div>
        </div>
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">Updated</div>
          <div class="text-zinc-100">{{ item.updated_at || '-' }}</div>
        </div>
        <div v-if="item.avatar_url" class="col-span-12">
          <img :src="item.avatar_url" class="h-16 w-16 rounded border border-zinc-800" />
        </div>
      </div>
    </Card>

    <Card :loading="loading">
      <template #title>绑定关系</template>
      <div v-if="item" class="space-y-3">
        <div class="text-sm">
          <span class="text-zinc-400">当前绑定：</span>
          <span v-if="item.device" class="text-zinc-100">
            <a
              class="underline hover:text-red-400"
              href="#"
              @click.prevent="router.push({ name: 'devices-detail', params: { device_id: item.device.device_id } })"
            >
              设备 {{ item.device.device_id }}
            </a>
            <span v-if="item.device.board_type"> · {{ item.device.board_type }}</span>
          </span>
          <span v-else class="text-zinc-500">未绑定</span>
        </div>

        <div class="flex flex-wrap gap-2 items-end">
          <div style="width: 260px">
            <div class="text-xs text-zinc-400 mb-1">绑定到 DeviceID</div>
            <Input v-model="bindDeviceId" placeholder="例如：ZEC_..." />
          </div>
          <Button type="primary" :loading="saving" @click="bind">绑定</Button>
          <Button type="default" :loading="saving" @click="unbind">解绑</Button>
        </div>
      </div>
    </Card>
  </div>
</template>
