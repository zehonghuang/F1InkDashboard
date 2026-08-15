<script setup lang="ts">
import { fetchMpNewsDetail, ingestMpNews, type MpNewsItem, type MpNewsRichTextNode } from '@/api/mpNews'
import RichTextRenderer from '@/components/RichTextRenderer.vue'
import ShopProductPickerModal from '@/components/ShopProductPickerModal.vue'
import {
  htmlToMpNodes,
  itemContentToHTML,
  nodesToHTML,
  buildShopCardNode,
  F1_SHOP_CARD_TAG,
} from '@/utils/mpNewsRichText'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
  content_mode: 'VISUAL' | 'JSON'
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
  content_mode: 'VISUAL',
  content_nodes_json: '[]',
})

const shopPickerVisible = ref(false)

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
  form.content_nodes_json = formatNodesJSON(item.content?.nodes)
  setEditorHTML(itemContentToHTML(item))
}

const editor = useEditor({
  extensions: [
    StarterKit,
    Link.configure({
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
    }),
    Image,
    Placeholder.configure({
      placeholder: '开始写正文，像 Notion 一样直接编辑...',
    }),
  ],
  content: '<p></p>',
  editorProps: {
    attributes: {
      class: 'tiptap prose max-w-none min-h-[420px] outline-none text-zinc-800',
    },
  },
  onUpdate: ({ editor }) => {
    if (form.content_mode !== 'VISUAL') return
    form.content_nodes_json = formatNodesJSON(htmlToMpNodes(editor.getHTML()))
  },
})

function setEditorHTML(html: string) {
  if (!editor.value) return
  editor.value.commands.setContent(html || '<p></p>', { emitUpdate: false })
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
    content: { format_code: 'RICH_TEXT_NODES', nodes: parseNodes() },
  }

  if (!payload.source?.name && !payload.source?.url) {
    delete payload.source
  }
  if (!payload.hero_display_code) {
    delete payload.hero_display_code
  }
  return payload
}

watch(
  () => form.content_mode,
  (mode) => {
    if (mode === 'JSON') {
      if (editor.value) {
        form.content_nodes_json = formatNodesJSON(htmlToMpNodes(editor.value.getHTML()))
      }
      return
    }
    setEditorHTML(nodesToHTML(previewNodes.value))
  },
)

function toggleMark(name: 'bold' | 'italic' | 'strike' | 'blockquote' | 'bulletList' | 'orderedList') {
  if (!editor.value) return
  const chain = editor.value.chain().focus()
  switch (name) {
    case 'bold':
      chain.toggleBold().run()
      return
    case 'italic':
      chain.toggleItalic().run()
      return
    case 'strike':
      chain.toggleStrike().run()
      return
    case 'blockquote':
      chain.toggleBlockquote().run()
      return
    case 'bulletList':
      chain.toggleBulletList().run()
      return
    case 'orderedList':
      chain.toggleOrderedList().run()
      return
  }
}

function setHeading(level: 1 | 2 | 3) {
  editor.value?.chain().focus().toggleHeading({ level }).run()
}

function setParagraph() {
  editor.value?.chain().focus().setParagraph().run()
}

function insertLink() {
  const href = window.prompt('输入链接地址')
  if (!href || !editor.value) return
  editor.value.chain().focus().extendMarkRange('link').setLink({ href }).run()
}

function insertImage() {
  const src = window.prompt('输入图片 URL')
  if (!src || !editor.value) return
  editor.value.chain().focus().setImage({ src }).run()
}

function insertShopCardJSON(productID: string, insertIndex?: number) {
  const curNodes = parseNodes()
  const card = buildShopCardNode(productID)
  const i = typeof insertIndex === 'number' ? insertIndex : curNodes.length
  const next: MpNewsRichTextNode[] = curNodes.slice(0, i)
  if (next.length && next[next.length - 1].name !== F1_SHOP_CARD_TAG) {
    const last = next[next.length - 1]
    if (last.name === 'p' || last.name === 'div' || last.name === 'blockquote') {
      /* 放在 block 后面即可 */
    }
  }
  next.push(card)
  next.push(...curNodes.slice(i))
  form.content_nodes_json = formatNodesJSON(next)
}

function findInsertIndexFromCaretInNodes(currentNodes: MpNewsRichTextNode[]): number {
  if (!editor.value) return currentNodes.length
  try {
    const doc = editor.value.state.doc
    const pos = editor.value.state.selection.head
    let flatIndex = 0
    let remaining = pos
    let stopped = false
    let nodeCursor = 0
    doc.forEach((_node, _offset, index) => {
      if (stopped) return
      nodeCursor = index
      const nodeSize = _node.nodeSize
      if (remaining <= nodeSize) {
        flatIndex = index
        stopped = true
        return
      }
      remaining -= nodeSize
    })
    if (!stopped) flatIndex = Math.min(currentNodes.length, nodeCursor + 1)
    return flatIndex
  } catch {
    return currentNodes.length
  }
}

async function insertShopCardAtCurrentPosition(productID: string) {
  const before = parseNodes()

  if (form.content_mode === 'JSON') {
    insertShopCardJSON(productID)
    Message.success(`已插入商品卡片 ${productID}`)
    return
  }

  if (!editor.value) {
    insertShopCardJSON(productID)
    Message.success(`已插入商品卡片 ${productID}`)
    return
  }

  const idx = findInsertIndexFromCaretInNodes(before)
  insertShopCardJSON(productID, idx)
  Message.success(`已插入商品卡片 ${productID}（位置 ${idx + 1}）`)

  await nextTick()
  const next = parseNodes()
  setEditorHTML(nodesToHTML(next))
}

function openShopPicker() {
  shopPickerVisible.value = true
}

function onShopPickerConfirm(productID: string) {
  const pid = String(productID || '').trim()
  if (!pid) return
  insertShopCardAtCurrentPosition(pid)
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
onBeforeUnmount(() => {
  editor.value?.destroy()
})
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
                :type="form.content_mode === 'VISUAL' ? 'primary' : 'default'"
                @click="form.content_mode = 'VISUAL'"
              >
                Tiptap 编辑
              </Button>
              <Button
                :type="form.content_mode === 'JSON' ? 'primary' : 'default'"
                @click="form.content_mode = 'JSON'"
              >
                JSON 高级模式
              </Button>
            </div>

            <div v-if="form.content_mode === 'VISUAL'">
              <div class="mb-3 flex flex-wrap gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <Button size="small" @click="setParagraph">正文</Button>
                <Button size="small" @click="setHeading(1)">H1</Button>
                <Button size="small" @click="setHeading(2)">H2</Button>
                <Button size="small" @click="setHeading(3)">H3</Button>
                <Button size="small" @click="toggleMark('bold')">加粗</Button>
                <Button size="small" @click="toggleMark('italic')">斜体</Button>
                <Button size="small" @click="toggleMark('strike')">删除线</Button>
                <Button size="small" @click="toggleMark('bulletList')">无序列表</Button>
                <Button size="small" @click="toggleMark('orderedList')">有序列表</Button>
                <Button size="small" @click="toggleMark('blockquote')">引用</Button>
                <Button size="small" @click="insertLink">链接</Button>
                <Button size="small" @click="insertImage">图片</Button>
                <Button size="small" type="primary" ghost @click="openShopPicker">
                  <span class="inline-flex items-center gap-1.5">
                    <svg class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fill-rule="evenodd"
                        d="M3.875 3A1.875 1.875 0 002 4.875v8.25C2 14.16 2.84 15 3.875 15h8.25C13.16 15 14 14.16 14 13.125v-8.25A1.875 1.875 0 0012.125 3h-8.25zM3.5 4.875a.375.375 0 01.375-.375h8.25a.375.375 0 01.375.375v8.25a.375.375 0 01-.375.375h-8.25a.375.375 0 01-.375-.375v-8.25z"
                        clip-rule="evenodd"
                      />
                      <path d="M5.5 6h7v1.2h-7zM5.5 8.2h7v1.2h-7zM5.5 10.4h4.2v1.2H5.5z" />
                    </svg>
                    插入商品
                  </span>
                </Button>
              </div>
              <div class="notion-field min-h-[420px] px-4 py-4">
                <EditorContent :editor="editor" />
              </div>
            </div>
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
              <RichTextRenderer v-if="previewNodes.length" :nodes="previewNodes" :base-url="baseUrl" />
              <div v-else class="text-sm text-zinc-400">等待合法的 RichText JSON</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <ShopProductPickerModal v-model="shopPickerVisible" @confirm="onShopPickerConfirm" />
  </div>
</template>

<style>
.f1-shop-card-placeholder {
  position: relative;
  margin: 12px 0;
  padding: 14px 18px;
  border-radius: 14px;
  border: 1px dashed #e10600;
  background:
    radial-gradient(1000px circle at 0% 0%, rgba(225, 6, 0, 0.06), transparent 60%),
    linear-gradient(180deg, rgba(250, 250, 250, 1), rgba(246, 246, 246, 1));
  user-select: none;
  pointer-events: none;
  box-shadow: 0 6px 22px -16px rgba(225, 6, 0, 0.45);
}
.f1-shop-card-placeholder::before {
  content: "";
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 58%;
  background: linear-gradient(180deg, #e10600, rgba(225, 6, 0, 0.25));
  border-radius: 2px;
}
.f1-shop-card-placeholder__title {
  padding-left: 10px;
  font-weight: 700;
  font-size: 14px;
  color: #0a0a0a;
  letter-spacing: 0.02em;
}
.f1-shop-card-placeholder__title code {
  background: rgba(225, 6, 0, 0.1);
  color: #b50700;
  padding: 1px 6px;
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 12px;
  font-weight: 600;
  margin-left: 4px;
}
.f1-shop-card-placeholder__hint {
  padding-left: 10px;
  margin-top: 4px;
  font-size: 11px;
  color: #8f8f8f;
}
</style>
