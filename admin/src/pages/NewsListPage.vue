<script setup lang="ts">
import { fetchMpNewsDetail, fetchMpNewsList, ingestMpNews, type MpNewsItem } from '@/api/mpNews'
import { computed, h, onMounted, ref, resolveComponent } from 'vue'
import { useRouter } from 'vue-router'
import { Message, Modal } from 'view-ui-plus'

const router = useRouter()

const loading = ref(false)
const errorText = ref('')
const quickBusyId = ref('')

const q = ref('')
const tag = ref('')
const layoutCode = ref('')
const typeCode = ref('')
const pinned = ref('')
const since = ref('')

const page = ref(1)
const pageSize = ref(20)

const total = ref(0)
const items = ref<MpNewsItem[]>([])

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

async function quickUpdate(id: string, patch: Partial<MpNewsItem>) {
  if (!id) return
  quickBusyId.value = id
  errorText.value = ''
  try {
    const detail = await fetchMpNewsDetail({ id, tz: 'Asia/Shanghai' })
    const cur = detail.item
    const next: MpNewsItem = {
      ...cur,
      ...patch,
      time_text: cur.time_text || '',
    }
    await ingestMpNews(next)
    Message.success('已更新')
    await load()
  } catch (e: any) {
    const msg = String(e?.message || e || '更新失败')
    errorText.value = msg
    Message.error(msg)
  } finally {
    if (quickBusyId.value === id) quickBusyId.value = ''
  }
}

async function setBanner(id: string) {
  const ok = await confirmAction('一键 Hero+Banner', '确认将该新闻一键设为 HERO + BANNER 展示吗？')
  if (!ok) return
  await quickUpdate(id, { layout_code: 'HERO', hero_display_code: 'BANNER' })
}

async function cancelHero(id: string) {
  const ok = await confirmAction('取消 Hero', '确认取消 HERO 吗？（会把 layout_code 设为 FEATURE）')
  if (!ok) return
  await quickUpdate(id, { layout_code: 'FEATURE', hero_display_code: '' })
}

const columns = computed(() => {
  return [
    {
      title: '标签',
      key: 'tag_text',
      width: 160,
      render: (hh: typeof h, params: any) => {
        return hh(
          'div',
          { class: 'text-xs truncate' },
          String(params.row.tag_text || ''),
        )
      },
    },
    {
      title: '标题',
      key: 'title',
      minWidth: 320,
      render: (hh: typeof h, params: any) => {
        const it = params.row as MpNewsItem
        return hh(
          'a',
          {
            class: 'transition-colors cursor-pointer',
            style: 'color:#17233d;',
            onClick: (e: MouseEvent) => {
              e.preventDefault()
              router.push({ name: 'news-detail', params: { id: it.id } })
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
    { title: '布局', key: 'layout_code', width: 120 },
    { title: '类型', key: 'type_code', width: 120 },
    {
      title: '置顶',
      key: 'pinned',
      width: 90,
      render: (hh: typeof h, params: any) => {
        const Tag = resolveComponent('Tag') as any
        const val = Boolean(params.row.pinned)
        return hh(Tag, { color: val ? 'red' : 'default' }, () => (val ? '是' : '否'))
      },
    },
    { title: '时间', key: 'published_at', width: 210 },
    {
      title: '操作',
      key: 'actions',
      width: 320,
      render: (hh: typeof h, params: any) => {
        const Button = resolveComponent('Button') as any
        const it = params.row as MpNewsItem
        const busy = quickBusyId.value === it.id
        const isHero = String(it.layout_code || '').toUpperCase() === 'HERO'
        const isBanner = isHero && String(it.hero_display_code || '').toUpperCase() === 'BANNER'
        return hh('div', { class: 'flex gap-1 flex-wrap' }, [
          hh(
            Button,
            {
              size: 'small',
              type: 'primary',
              onClick: () => router.push({ name: 'news-detail', params: { id: it.id } }),
            },
            () => '预览',
          ),
          hh(
            Button,
            {
              size: 'small',
              type: 'error',
              ghost: true,
              disabled: busy || isBanner,
              loading: busy,
              onClick: () => setBanner(it.id),
            },
            () => 'Hero+Banner',
          ),
          hh(
            Button,
            {
              size: 'small',
              type: 'default',
              disabled: busy || !isHero,
              onClick: () => cancelHero(it.id),
            },
            () => '取消',
          ),
          hh(
            Button,
            {
              size: 'small',
              type: 'default',
              disabled: busy,
              onClick: () => router.push({ name: 'news-edit', params: { id: it.id } }),
            },
            () => '编辑',
          ),
        ])
      },
    },
  ]
})

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchMpNewsList({
      tz: 'Asia/Shanghai',
      page: page.value,
      pageSize: pageSize.value,
      q: q.value.trim() || undefined,
      tag: tag.value.trim() || undefined,
      layoutCode: layoutCode.value.trim() || undefined,
      typeCode: typeCode.value.trim() || undefined,
      pinned: pinned.value || undefined,
      since: since.value.trim() || undefined,
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
      <template #title>新闻管理</template>
      <Form inline label-position="left">
        <FormItem label="搜索">
          <Input v-model="q" placeholder="标题/摘要/标签" style="width: 220px" />
        </FormItem>
        <FormItem label="Tag">
          <Input v-model="tag" placeholder="精确 tag 或模糊匹配" style="width: 200px" />
        </FormItem>
        <FormItem label="Layout">
          <Input v-model="layoutCode" placeholder="例如：HERO/FEATURE" style="width: 160px" />
        </FormItem>
        <FormItem label="Type">
          <Input v-model="typeCode" placeholder="例如：PADDOCK" style="width: 160px" />
        </FormItem>
        <FormItem label="置顶">
          <Select v-model="pinned" clearable style="width: 120px">
            <Option value="1">是</Option>
            <Option value="0">否</Option>
          </Select>
        </FormItem>
        <FormItem label="Since">
          <Input v-model="since" placeholder="RFC3339，例如 2026-05-01T00:00:00+08:00" style="width: 260px" />
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
