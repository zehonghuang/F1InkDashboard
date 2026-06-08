<script setup lang="ts">
import { fetchMpNewsDetail, ingestMpNews, type MpNewsItem, type MpNewsRichTextNode } from '@/api/mpNews'
import RichTextRenderer from '@/components/RichTextRenderer.vue'
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from 'view-ui-plus'

type EditorForm = {
  title: string
  summary: string
  tag_text: string
  tags_text: string
  cover_url: string
  published_at: string
  type_code: string
  layout_code: string
  hero_display_code: string
  weight: number
  pinned: boolean
  source_name: string
  source_url: string
  content_format_code: 'PLAIN' | 'RICH_TEXT_NODES'
  content_text: string
  content_nodes_json: string
}

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id || ''))

const loading = ref(false)
const saving = ref(false)
const errorText = ref('')
const baseUrl = ref('')
const original = ref<MpNewsItem | null>(null)

const form = reactive<EditorForm>({
  title: '',
  summary: '',
  tag_text: '',
  tags_text: '',
  cover_url: '',
  published_at: '',
  type_code: '',
  layout_code: '',
  hero_display_code: '',
  weight: 0,
  pinned: false,
  source_name: '',
  source_url: '',
  content_format_code: 'PLAIN',
  content_text: '',
  content_nodes_json: '[]',
})

function formatNodesJSON(nodes?: MpNewsRichTextNode[]) {
  return JSON.stringify(nodes || [], null, 2)
}

function fillForm(item: MpNewsItem) {
  form.title = item.title || ''
  form.summary = item.summary || ''
  form.tag_text = item.tag_text || ''
  form.tags_text = (item.tags || []).join(', ')
  form.cover_url = item.cover_url || ''
  form.published_at = item.published_at || ''
  form.type_code = item.type_code || ''
  form.layout_code = item.layout_code || ''
  form.hero_display_code = item.hero_display_code || ''
  form.weight = Number(item.weight || 0)
  form.pinned = Boolean(item.pinned)
  form.source_name = item.source?.name || ''
  form.source_url = item.source?.url || ''
  form.content_format_code = item.content?.format_code === 'RICH_TEXT_NODES' ? 'RICH_TEXT_NODES' : 'PLAIN'
  form.content_text = item.content?.text || ''
  form.content_nodes_json = formatNodesJSON(item.content?.nodes)
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchMpNewsDetail({ id: id.value, tz: 'Asia/Shanghai' })
    baseUrl.value = (res.base_url || '').trim()
    original.value = res.item
    fillForm(res.item)
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

function parseNodes(): MpNewsRichTextNode[] {
  const raw = form.content_nodes_json.trim()
  if (!raw) return []
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('RICH_TEXT_NODES 不是合法 JSON')
  }
  if (Array.isArray(parsed)) return parsed as MpNewsRichTextNode[]
  if (parsed && typeof parsed === 'object') return [parsed as MpNewsRichTextNode]
  throw new Error('RICH_TEXT_NODES 必须是对象或数组')
}

const previewNodes = computed(() => {
  if (form.content_format_code !== 'RICH_TEXT_NODES') return []
  try {
    return parseNodes()
  } catch {
    return []
  }
})

const previewCoverUrl = computed(() => {
  const u = form.cover_url.trim()
  if (!u) return ''
  if (u.startsWith('http://') || u.startsWith('https://')) return u
  if (u.startsWith('/') && baseUrl.value) return baseUrl.value.replace(/\/+$/, '') + u
  return u
})

function buildPayload(): MpNewsItem {
  const cur = original.value
  if (!cur) throw new Error('文章尚未加载')

  const tags = form.tags_text
    .split(',')
    .map((it) => it.trim())
    .filter(Boolean)

  const payload: MpNewsItem = {
    ...cur,
    title: form.title.trim(),
    summary: form.summary.trim(),
    tag_text: form.tag_text.trim(),
    tags,
    cover_url: form.cover_url.trim(),
    published_at: form.published_at.trim(),
    type_code: form.type_code.trim(),
    layout_code: form.layout_code.trim(),
    hero_display_code: form.hero_display_code.trim(),
    weight: Number.isFinite(Number(form.weight)) ? Number(form.weight) : 0,
    pinned: Boolean(form.pinned),
    time_text: cur.time_text || '',
    source: {
      name: form.source_name.trim(),
      url: form.source_url.trim(),
    },
    content:
      form.content_format_code === 'RICH_TEXT_NODES'
        ? { format_code: 'RICH_TEXT_NODES', nodes: parseNodes() }
        : { format_code: 'PLAIN', text: form.content_text },
  }

  if (!payload.source?.name && !payload.source?.url) {
    delete payload.source
  }
  if (!payload.hero_display_code) {
    delete payload.hero_display_code
  }
  return payload
}

async function save() {
  saving.value = true
  errorText.value = ''
  try {
    const payload = buildPayload()
    await ingestMpNews(payload)
    Message.success('文章已保存')
    await load()
  } catch (e: any) {
    const msg = String(e?.message || e || '保存失败')
    errorText.value = msg
    Message.error(msg)
  } finally {
    saving.value = false
  }
}

function goDetail() {
  router.push({ name: 'news-detail', params: { id: id.value } })
}

onMounted(load)
</script>

<template>
  <div class="notion-page space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <div class="text-xs uppercase tracking-[0.24em] text-zinc-400">Editorial Studio</div>
        <div class="text-sm text-zinc-700">Notion 风格文章编辑页</div>
      </div>
      <div class="flex gap-2">
        <Button type="default" @click="goDetail">返回预览</Button>
        <Button type="primary" :loading="saving" @click="save">保存文章</Button>
      </div>
    </div>

    <Alert v-if="errorText" type="error" show-icon>{{ errorText }}</Alert>

    <div class="grid grid-cols-12 gap-4">
      <div class="col-span-12 xl:col-span-8">
        <div class="notion-doc px-6 py-8 md:px-10">
          <div class="mb-6">
            <input v-model="form.title" class="notion-title-input" placeholder="无标题文章" />
          </div>

          <div class="grid grid-cols-12 gap-4">
            <div class="col-span-12 md:col-span-6">
              <div class="notion-label mb-2">标签</div>
              <input v-model="form.tag_text" class="notion-field" placeholder="例如：Ferrari / 车队" />
            </div>
            <div class="col-span-12 md:col-span-6">
              <div class="notion-label mb-2">标签列表</div>
              <input v-model="form.tags_text" class="notion-field" placeholder="逗号分隔，例如 ferrari, team" />
            </div>
            <div class="col-span-12">
              <div class="notion-label mb-2">摘要</div>
              <textarea
                v-model="form.summary"
                class="notion-field notion-textarea"
                style="min-height: 110px"
                placeholder="写一段用于列表与预览的摘要"
              />
            </div>
          </div>

          <div class="mt-8 border-t border-zinc-200 pt-6">
            <div class="notion-label mb-3">正文</div>
            <div class="mb-4 flex flex-wrap items-center gap-2">
              <Button
                :type="form.content_format_code === 'PLAIN' ? 'primary' : 'default'"
                @click="form.content_format_code = 'PLAIN'"
              >
                纯文本
              </Button>
              <Button
                :type="form.content_format_code === 'RICH_TEXT_NODES' ? 'primary' : 'default'"
                @click="form.content_format_code = 'RICH_TEXT_NODES'"
              >
                RichText JSON
              </Button>
            </div>

            <textarea
              v-if="form.content_format_code === 'PLAIN'"
              v-model="form.content_text"
              class="notion-field notion-textarea"
              style="min-height: 420px"
              placeholder="直接编辑正文内容"
            />
            <textarea
              v-else
              v-model="form.content_nodes_json"
              class="notion-field notion-textarea font-mono text-[12px]"
              style="min-height: 420px"
              placeholder="编辑 RICH_TEXT_NODES JSON"
            />
          </div>
        </div>
      </div>

      <div class="col-span-12 xl:col-span-4 space-y-4">
        <div class="notion-sidebar p-5">
          <div class="text-sm font-semibold text-zinc-900">文章属性</div>
          <div class="mt-4 space-y-4">
            <div>
              <div class="notion-label mb-2">发布时间</div>
              <input v-model="form.published_at" class="notion-field" placeholder="RFC3339 时间" />
            </div>
            <div>
              <div class="notion-label mb-2">类型</div>
              <input v-model="form.type_code" class="notion-field" placeholder="例如 PADDOCK / DRIVER" />
            </div>
            <div>
              <div class="notion-label mb-2">布局</div>
              <input v-model="form.layout_code" class="notion-field" placeholder="例如 HERO / FEATURE / STANDARD" />
            </div>
            <div>
              <div class="notion-label mb-2">Hero 展示</div>
              <input v-model="form.hero_display_code" class="notion-field" placeholder="留空或 BANNER" />
            </div>
            <div>
              <div class="notion-label mb-2">权重</div>
              <input v-model.number="form.weight" type="number" class="notion-field" />
            </div>
            <label class="flex items-center gap-2 text-sm text-zinc-700">
              <input v-model="form.pinned" type="checkbox" />
              置顶
            </label>
          </div>
        </div>

        <div class="notion-sidebar p-5">
          <div class="text-sm font-semibold text-zinc-900">封面与来源</div>
          <div class="mt-4 space-y-4">
            <div>
              <div class="notion-label mb-2">封面 URL</div>
              <input v-model="form.cover_url" class="notion-field" placeholder="http(s):// 或 /static/..." />
            </div>
            <div>
              <div class="notion-label mb-2">来源名称</div>
              <input v-model="form.source_name" class="notion-field" placeholder="例如 Autosport" />
            </div>
            <div>
              <div class="notion-label mb-2">来源链接</div>
              <input v-model="form.source_url" class="notion-field" placeholder="https://..." />
            </div>
            <div v-if="previewCoverUrl" class="overflow-hidden rounded-xl border border-zinc-200">
              <img :src="previewCoverUrl" class="block w-full" />
            </div>
          </div>
        </div>

        <div class="notion-sidebar p-5">
          <div class="text-sm font-semibold text-zinc-900">实时预览</div>
          <div class="mt-4 space-y-3">
            <div class="text-2xl font-semibold leading-tight text-zinc-900">
              {{ form.title || '无标题文章' }}
            </div>
            <div class="text-xs text-zinc-500">
              {{ form.tag_text || '未设置标签' }} · {{ form.published_at || '未设置时间' }}
            </div>
            <div class="whitespace-pre-line text-sm text-zinc-700">
              {{ form.summary || '摘要会显示在这里' }}
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-4">
              <div v-if="form.content_format_code === 'PLAIN'" class="whitespace-pre-line text-sm text-zinc-800">
                {{ form.content_text || '正文预览区域' }}
              </div>
              <RichTextRenderer
                v-else-if="previewNodes.length"
                :nodes="previewNodes"
                :base-url="baseUrl"
              />
              <div v-else class="text-sm text-zinc-400">等待合法的 RichText JSON</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

