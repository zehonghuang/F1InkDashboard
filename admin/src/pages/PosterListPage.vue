<script setup lang="ts">
import {
  createPoster,
  deletePoster,
  fetchPosterList,
  updatePoster,
  type MpPosterItem,
  type MpPosterStatus,
} from '@/api/mpPoster'
import { getApiBase } from '@/api/http'
import { computed, h, onMounted, ref, resolveComponent } from 'vue'
import { useRouter } from 'vue-router'
import { Message, Modal } from 'view-ui-plus'

const router = useRouter()

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const quickBusyId = ref<number | null>(null)

const page = ref(1)
const pageSize = ref(20)
const total = ref(0)
const items = ref<MpPosterItem[]>([])
const statusFilter = ref('')

const statusLabel: Record<MpPosterStatus, string> = {
  draft: '草稿',
  published: '已发布',
  offline: '已下线',
}

const statusColor: Record<MpPosterStatus, string> = {
  draft: 'default',
  published: 'green',
  offline: 'orange',
}

function confirmAction(title: string, content: string) {
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title,
      content,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}

function effectiveUrl(u: string) {
  const base = getApiBase()
  const v = (u || '').trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  return base + v
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchPosterList({
      page: page.value,
      pageSize: pageSize.value,
      status: statusFilter.value || undefined,
    })
    total.value = Number(res.total || 0)
    items.value = res.items || []
  } catch (e: any) {
    const msg = String(e?.message || e || '加载失败')
    errorText.value = msg
    Message.error(msg)
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  saving.value = true
  errorText.value = ''
  try {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const tzNow = new Date(now.getTime() + 8 * 3600 * 1000)
    const title = `未命名海报 ${tzNow.getFullYear()}-${pad(tzNow.getMonth() + 1)}-${pad(tzNow.getDate())} ${pad(tzNow.getHours())}:${pad(tzNow.getMinutes())}`
    const res = await createPoster({
      title,
      status: 'draft',
      weight: 0,
      content_format: 'RICH_TEXT_NODES',
    })
    Message.success('已创建草稿')
    router.push({ name: 'poster-edit', params: { id: String(res.item.id) } })
  } catch (e: any) {
    const msg = String(e?.message || e || '创建失败')
    errorText.value = msg
    Message.error(msg)
  } finally {
    saving.value = false
  }
}

async function setStatus(id: number, status: MpPosterStatus) {
  const ok = await confirmAction(
    '更改状态',
    `确认将该海报状态改为「${statusLabel[status]}」吗？`,
  )
  if (!ok) return
  quickBusyId.value = id
  try {
    await updatePoster(id, { status })
    Message.success('已更新')
    await load()
  } catch (e: any) {
    Message.error(String(e?.message || e || '更新失败'))
  } finally {
    quickBusyId.value = null
  }
}

async function onDelete(id: number) {
  const ok = await confirmAction('删除海报', '确认删除该海报吗？此操作不可撤销。')
  if (!ok) return
  quickBusyId.value = id
  try {
    await deletePoster(id)
    Message.success('已删除')
    await load()
  } catch (e: any) {
    Message.error(String(e?.message || e || '删除失败'))
  } finally {
    quickBusyId.value = null
  }
}

const columns = computed(() => {
  return [
    {
      title: '缩略图',
      key: 'poster_url',
      width: 120,
      render: (hh: typeof h, params: any) => {
        const it = params.row as MpPosterItem
        const url = effectiveUrl(it.poster_url)
        if (!url) {
          return hh('div', { class: 'w-[84px] h-[84px] rounded border border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center text-xs text-zinc-400' }, '未上传')
        }
        const ratio = Number(it.poster_ratio) || 0
        let boxStyle = 'max-width:84px;max-height:84px;'
        if (ratio > 0) {
          const w = ratio >= 1 ? 84 : Math.round(84 * ratio)
          const h = ratio >= 1 ? Math.round(84 / ratio) : 84
          boxStyle = `width:${w}px;height:${h}px;`
        }
        return hh('div', { class: 'flex items-center justify-center' }, [
          hh('img', {
            src: url,
            style: boxStyle + 'object-fit:cover;border-radius:6px;',
          }),
        ])
      },
    },
    {
      title: '标题',
      key: 'title',
      minWidth: 260,
      render: (hh: typeof h, params: any) => {
        const it = params.row as MpPosterItem
        return hh(
          'a',
          {
            class: 'transition-colors cursor-pointer font-medium',
            style: 'color:#17233d;',
            onClick: (e: MouseEvent) => {
              e.preventDefault()
              router.push({ name: 'poster-edit', params: { id: String(it.id) } })
            },
            onMouseenter: (e: MouseEvent) => {
              const el = e.currentTarget as HTMLElement | null
              if (el) el.style.color = '#ed4014'
            },
            onMouseleave: (e: MouseEvent) => {
              const el = e.currentTarget as HTMLElement | null
              if (el) el.style.color = '#17233d'
            },
          },
          String(it.title || ''),
        )
      },
    },
    {
      title: '尺寸 (W×H)',
      key: 'poster_width',
      width: 150,
      render: (hh: typeof h, params: any) => {
        const it = params.row as MpPosterItem
        const w = Number(it.poster_width) || 0
        const h2 = Number(it.poster_height) || 0
        if (!w || !h2) return hh('span', { class: 'text-xs text-zinc-400' }, '—')
        const ratio = Number(it.poster_ratio) || 0
        return hh('div', {}, [
          hh('div', { class: 'text-xs text-zinc-700' }, `${w} × ${h2}`),
          ratio > 0 ? hh('div', { class: 'text-[11px] text-zinc-400 mt-0.5' }, `比例 ${ratio.toFixed(3)}`) : null,
        ])
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 120,
      render: (hh: typeof h, params: any) => {
        const Tag = resolveComponent('Tag') as any
        const it = params.row as MpPosterItem
        const s = (it.status || 'draft') as MpPosterStatus
        return hh(Tag, { color: statusColor[s] || 'default' }, () => statusLabel[s] || s)
      },
    },
    { title: '权重', key: 'weight', width: 90 },
    { title: '创建时间', key: 'created_at', width: 200 },
    {
      title: '操作',
      key: 'actions',
      width: 300,
      render: (hh: typeof h, params: any) => {
        const Button = resolveComponent('Button') as any
        const it = params.row as MpPosterItem
        const busy = quickBusyId.value === it.id
        const status = (it.status || 'draft') as MpPosterStatus
        const children: any[] = [
          hh(
            Button,
            {
              size: 'small',
              type: 'primary',
              loading: busy,
              onClick: () => router.push({ name: 'poster-edit', params: { id: String(it.id) } }),
            },
            () => '编辑',
          ),
        ]
        if (status !== 'published') {
          children.push(
            hh(
              Button,
              {
                size: 'small',
                type: 'success',
                loading: busy,
                onClick: () => setStatus(it.id, 'published'),
              },
              () => '发布',
            ),
          )
        }
        if (status === 'published') {
          children.push(
            hh(
              Button,
              {
                size: 'small',
                type: 'warning',
                loading: busy,
                onClick: () => setStatus(it.id, 'offline'),
              },
              () => '下线',
            ),
          )
        }
        children.push(
          hh(
            Button,
            {
              size: 'small',
              type: 'error',
              loading: busy,
              onClick: () => onDelete(it.id),
            },
            () => '删除',
          ),
        )
        return hh('div', { class: 'flex gap-1 flex-wrap' }, children)
      },
    },
  ]
})

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <Card>
      <template #title>海报管理</template>
      <template #extra>
        <div class="flex gap-2">
          <Select
            v-model="statusFilter"
            style="width: 160px"
            placeholder="筛选状态"
            clearable
            @on-change="() => { page = 1; load() }"
          >
            <Option value="draft">草稿</Option>
            <Option value="published">已发布</Option>
            <Option value="offline">已下线</Option>
          </Select>
          <Button :loading="saving" type="primary" @click="onCreate">
            新建海报
          </Button>
        </div>
      </template>

      <Alert v-if="errorText" type="error" show-icon>{{ errorText }}</Alert>

      <div class="text-xs text-zinc-500 mb-3 leading-5">
        用于小程序资讯页面展示的长方形浮动海报入口。状态为「已发布」且权重最高的一条会在小程序中显示。
      </div>

      <Table
        :loading="loading"
        :columns="columns"
        :data="items"
        border
        stripe
      >
        <template #footer>
          <div class="flex justify-end">
            <Page
              :current="page"
              :page-size="pageSize"
              :total="total"
              show-total
              :page-size-opts="[10, 20, 50, 100]"
              @on-change="(p: number) => { page = p; load() }"
              @on-page-size-change="(s: number) => { pageSize = s; page = 1; load() }"
            />
          </div>
        </template>
      </Table>
    </Card>
  </div>
</template>
