<script setup lang="ts">
import { fetchAdminUsers, type AdminUserItem } from '@/api/admin'
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const loading = ref(false)
const errorText = ref('')

const q = ref('')
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<AdminUserItem[]>([])

const columns = computed(() => {
  return [
    {
      title: 'UserID',
      key: 'id',
      width: 120,
      render: (hh: typeof h, params: any) => {
        const it = params.row as AdminUserItem
        return hh(
          'a',
          {
            class: 'text-zinc-100 hover:text-red-400 transition-colors cursor-pointer',
            onClick: (e: MouseEvent) => {
              e.preventDefault()
              router.push({ name: 'users-detail', params: { user_id: it.id } })
            },
          },
          String(it.id),
        )
      },
    },
    {
      title: '昵称',
      key: 'nick_name',
      width: 180,
      render: (hh: typeof h, params: any) => {
        const it = params.row as AdminUserItem
        return hh('span', { class: 'text-zinc-200' }, it.nick_name || '-')
      },
    },
    {
      title: 'OpenID',
      key: 'openid',
      minWidth: 260,
      render: (hh: typeof h, params: any) => {
        const it = params.row as AdminUserItem
        return hh('span', { class: 'text-xs text-zinc-400 break-all' }, it.openid)
      },
    },
    {
      title: '绑定设备',
      key: 'device',
      minWidth: 220,
      render: (hh: typeof h, params: any) => {
        const d = (params.row as AdminUserItem).device
        if (!d) return hh('span', { class: 'text-zinc-500' }, '-')
        return hh(
          'a',
          {
            class: 'text-zinc-100 hover:text-red-400 transition-colors cursor-pointer',
            onClick: (e: MouseEvent) => {
              e.preventDefault()
              router.push({ name: 'devices-detail', params: { device_id: d.device_id } })
            },
          },
          d.device_id,
        )
      },
    },
    { title: '更新时间', key: 'updated_at', width: 240 },
  ]
})

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchAdminUsers({
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
      <template #title>用户</template>
      <Form inline>
        <FormItem label="搜索">
          <Input v-model="q" placeholder="openid/unionid/nick" style="width: 260px" />
        </FormItem>
        <FormItem>
          <Button type="primary" :loading="loading" @click="search">查询</Button>
        </FormItem>
      </Form>
      <Alert v-if="errorText" type="error" show-icon>{{ errorText }}</Alert>
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
