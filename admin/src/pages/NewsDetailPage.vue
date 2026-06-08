<script setup lang="ts">
import { fetchMpNewsDetail, ingestMpNews, type MpNewsItem } from '@/api/mpNews'
import RichTextRenderer from '@/components/RichTextRenderer.vue'
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id || ''))

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')

const baseUrl = ref('')
const item = ref<MpNewsItem | null>(null)

const coverUrl = computed(() => {
  const it = item.value
  if (!it) return ''
  const u = String(it.cover_url || '').trim()
  if (!u) return ''
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/') && baseUrl.value) return baseUrl.value.replace(/\/+$/, '') + u
  return u
})

const contentFormatCode = computed(() => String(item.value?.content?.format_code || ''))
const contentText = computed(() => String(item.value?.content?.text || ''))
const contentNodes = computed(() => item.value?.content?.nodes || [])

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchMpNewsDetail({ id: id.value, tz: 'Asia/Shanghai' })
    baseUrl.value = (res.base_url || '').trim()
    item.value = res.item
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

async function updateItem(patch: Partial<MpNewsItem>) {
  const cur = item.value
  if (!cur) return
  saving.value = true
  errorText.value = ''
  try {
    const next: MpNewsItem = {
      ...cur,
      ...patch,
      time_text: cur.time_text || '',
    }
    if (patch.hero_display_code === '') {
      next.hero_display_code = ''
    }
    await ingestMpNews(next)
    await load()
  } catch (e: any) {
    errorText.value = String(e?.message || e || '保存失败')
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push({ name: 'news-list' })
}

function goEdit() {
  router.push({ name: 'news-edit', params: { id: id.value } })
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <Card>
      <template #title>新闻预览</template>
      <div class="flex items-center justify-between gap-3">
        <div class="text-xs text-zinc-400">ID：{{ id }}</div>
        <div class="flex gap-2">
          <Button size="small" type="default" @click="goEdit">编辑文章</Button>
          <Button size="small" type="default" @click="goBack">返回列表</Button>
        </div>
      </div>
      <Alert v-if="errorText" type="error" show-icon class="mt-3">{{ errorText }}</Alert>
    </Card>

    <div class="grid grid-cols-12 gap-4">
      <Card class="col-span-12 lg:col-span-4" :loading="loading">
        <template #title>文章信息</template>
        <div v-if="item" class="space-y-3">
          <div class="text-sm font-semibold text-zinc-900">{{ item.title }}</div>
          <div class="text-xs text-zinc-400">{{ item.tag_text }} · {{ item.published_at }}</div>
          <div class="whitespace-pre-line text-sm text-zinc-700">{{ item.summary }}</div>
          <div v-if="item.source?.name || item.source?.url" class="text-xs text-zinc-400">
            来源：
            <a
              v-if="item.source?.url"
              class="underline text-zinc-700 hover:text-red-400"
              :href="item.source.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ item.source?.name || item.source?.url }}
            </a>
            <span v-else>{{ item.source?.name }}</span>
          </div>
          <div v-if="coverUrl" class="pt-2">
            <img :src="coverUrl" class="w-full rounded border border-zinc-800" />
          </div>
        </div>
      </Card>

      <Card class="col-span-12 lg:col-span-8" :loading="loading">
        <template #title>渲染预览</template>
        <div v-if="item" class="rounded border border-zinc-800 bg-zinc-950 p-4">
          <div v-if="contentFormatCode === 'PLAIN'" class="text-sm text-zinc-200 whitespace-pre-line">
            {{ contentText }}
          </div>
          <RichTextRenderer
            v-else-if="contentFormatCode === 'RICH_TEXT_NODES' && contentNodes.length"
            :nodes="contentNodes"
            :base-url="baseUrl"
          />
          <div v-else class="text-sm text-zinc-400">暂无可预览内容</div>
        </div>
      </Card>

      <Card class="col-span-12" :loading="loading">
        <template #title>一键设置</template>
        <div class="flex flex-wrap gap-2">
          <Button type="primary" :loading="saving" @click="updateItem({ layout_code: 'HERO', hero_display_code: '' })">
            设为 Hero
          </Button>
          <Button
            type="primary"
            ghost
            :loading="saving"
            @click="updateItem({ layout_code: 'HERO', hero_display_code: 'BANNER' })"
          >
            一键 Hero+Banner
          </Button>
          <Button
            type="default"
            :loading="saving"
            @click="updateItem({ layout_code: 'FEATURE', hero_display_code: '' })"
          >
            取消 Hero
          </Button>
          <Button type="default" :loading="saving" @click="goEdit">编辑文章</Button>
        </div>
        <div class="mt-2 text-xs text-zinc-400">
          说明：以上操作通过回写 /api/v1/mp/news/ingest 完成；若服务端配置了 NEWS_INGEST_TOKEN，请在“设置”页填入 Token。
        </div>
      </Card>
    </div>
  </div>
</template>
