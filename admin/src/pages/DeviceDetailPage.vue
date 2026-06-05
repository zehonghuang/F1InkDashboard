<script setup lang="ts">
import { adminBind, adminUnbind, fetchAdminDeviceDetail, type AdminDeviceItem } from '@/api/admin'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const deviceId = computed(() => String(route.params.device_id || ''))

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const item = ref<AdminDeviceItem | null>(null)

const bindUserId = ref('')

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchAdminDeviceDetail(deviceId.value)
    item.value = res.item
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

async function bind() {
  const uid = Number(bindUserId.value)
  if (!uid || uid <= 0) {
    errorText.value = 'user_id_required'
    return
  }
  saving.value = true
  errorText.value = ''
  try {
    await adminBind({ user_id: uid, device_id: deviceId.value })
    bindUserId.value = ''
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
    await adminUnbind({ device_id: deviceId.value })
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
      <template #title>设备详情</template>
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs text-zinc-400">DeviceID：{{ deviceId }}</div>
        <Button size="small" type="default" @click="router.push({ name: 'devices-list' })">返回列表</Button>
      </div>
      <Alert v-if="errorText" type="error" show-icon class="mt-3">{{ errorText }}</Alert>
    </Card>

    <Card :loading="loading">
      <template #title>设备信息</template>
      <div v-if="item" class="grid grid-cols-12 gap-4 text-sm">
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">Board</div>
          <div class="text-zinc-100">{{ item.board_type || '-' }}</div>
        </div>
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">FW UA</div>
          <div class="text-zinc-100 break-all">{{ item.fw_user_agent || '-' }}</div>
        </div>
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">First Seen</div>
          <div class="text-zinc-100">{{ item.first_seen_at || '-' }}</div>
        </div>
        <div class="col-span-12 lg:col-span-6">
          <div class="text-zinc-400">Last Seen</div>
          <div class="text-zinc-100">{{ item.last_seen_at || '-' }}</div>
        </div>
        <div class="col-span-12">
          <div class="text-zinc-400">MAC</div>
          <div class="text-zinc-100 break-all">{{ item.mac || '-' }}</div>
        </div>
      </div>
    </Card>

    <Card :loading="loading">
      <template #title>绑定关系</template>
      <div v-if="item" class="space-y-3">
        <div class="text-sm">
          <span class="text-zinc-400">当前绑定：</span>
          <span v-if="item.bound_user" class="text-zinc-100">
            <a
              class="underline hover:text-red-400"
              href="#"
              @click.prevent="router.push({ name: 'users-detail', params: { user_id: item.bound_user.id } })"
            >
              用户 {{ item.bound_user.id }}
            </a>
            <span v-if="item.bound_user.nick_name"> · {{ item.bound_user.nick_name }}</span>
          </span>
          <span v-else class="text-zinc-500">未绑定</span>
        </div>

        <div class="flex flex-wrap gap-2 items-end">
          <div style="width: 220px">
            <div class="text-xs text-zinc-400 mb-1">绑定到 UserID</div>
            <Input v-model="bindUserId" placeholder="例如：123" />
          </div>
          <Button type="primary" :loading="saving" @click="bind">绑定</Button>
          <Button type="default" :loading="saving" @click="unbind">解绑</Button>
        </div>
      </div>
    </Card>
  </div>
</template>
