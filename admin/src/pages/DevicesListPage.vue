<script setup lang="ts">
import { fetchAdminDevices, type AdminDeviceItem } from '@/api/admin'
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const loading = ref(false)
const errorText = ref('')

const q = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<AdminDeviceItem[]>([])

const columns = computed(() => {
  return [
    {
      title: 'DeviceID',
      key: 'device_id',
      minWidth: 220,
      render: (hh: typeof h, params: any) => {
        const it = params.row as AdminDeviceItem
        return hh(
          'a',
          {
            class: 'text-zinc-100 hover:text-red-400 transition-colors cursor-pointer',
            onClick: (e: MouseEvent) => {
              e.preventDefault()
              router.push({ name: 'devices-detail', params: { device_id: it.device_id } })
            },
          },
          it.device_id,
        )
      },
    },
    { title: 'Board', key: 'board_type', width: 160 },
    { title: 'FW', key: 'fw_user_agent', minWidth: 220 },
    { title: 'Last Seen', key: 'last_seen_at', width: 240 },
    {
      title: '绑定用户',
      key: 'bound_user',
      width: 180,
      render: (hh: typeof h, params: any) => {
        const u = (params.row as AdminDeviceItem).bound_user
        if (!u) return hh('span', { class: 'text-zinc-500' }, '-')
        return hh('span', { class: 'text-zinc-200' }, `${u.id}${u.nick_name ? ` · ${u.nick_name}` : ''}`)
      },
    },
  ]
})

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchAdminDevices({
      page: page.value,
      pageSize: pageSize.value,
      q: q.value.trim() || undefined,
    })
    items.value = res.items || []
    total.value = res.total || 0
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

function onPageChange(p: number) {
  page.value = p
  load()
}

function onPageSizeChange(ps: number) {
  pageSize.value = ps
  page.value = 1
  load()
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <Card>
      <template #title>设备</template>
      <Form inline>
        <FormItem label="搜索">
          <Input v-model="q" placeholder="device_id/mac/board/fw" style="width: 260px" />
        </FormItem>
        <FormItem>
          <Button type="primary" :loading="loading" @click="search">查询</Button>
        </FormItem>
      </Form>
      <Alert v-if="errorText" type="error" show-icon>{{ errorText }}</Alert>
      <div class="mt-2 text-xs text-zinc-400">
        若服务端设置了 BACKEND_ADMIN_TOKEN，请在“设置”页填入 Token。
      </div>
    </Card>

    <Card>
      <Table :loading="loading" :columns="columns" :data="items" />
      <div class="mt-3 flex justify-end">
        <Page
          :total="total"
          :current="page"
          :page-size="pageSize"
          show-sizer
          show-total
          @on-change="onPageChange"
          @on-page-size-change="onPageSizeChange"
        />
      </div>
    </Card>
  </div>
</template>
