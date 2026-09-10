<script setup lang="ts">
import {
  createPoster,
  fetchPosterDetail,
  updatePoster,
  uploadPosterImage,
  type MpPosterItem,
  type MpPosterStatus,
} from '@/api/mpPoster'
import RichTextRenderer from '@/components/RichTextRenderer.vue'
import {
  htmlToMpNodes,
  nodesToHTML,
  type MpNewsRichTextNode as MpPosterRichTextNode,
} from '@/utils/mpNewsRichText'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from 'view-ui-plus'
import { getApiBase } from '@/api/http'

type EditorForm = {
  title: string
  poster_url: string
  poster_width: number
  poster_height: number
  poster_ratio: number
  status: MpPosterStatus
  weight: number
  published_at: string
  content_mode: 'VISUAL' | 'JSON'
  content_nodes_json: string
}

const route = useRoute()
const router = useRouter()
const id = computed(() => {
  const raw = String(route.params.id || '')
  const n = parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : 0
})

const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const errorText = ref('')
const baseUrl = ref('')
const original = ref<MpPosterItem | null>(null)
const posterFileInput = ref<HTMLInputElement | null>(null)

const form = reactive<EditorForm>({
  title: '',
  poster_url: '',
  poster_width: 0,
  poster_height: 0,
  poster_ratio: 0,
  status: 'draft',
  weight: 0,
  published_at: '',
  content_mode: 'VISUAL',
  content_nodes_json: '[]',
})

function formatNodesJSON(nodes?: any[]) {
  return JSON.stringify(nodes || [], null, 2)
}

function parseNodes(): any[] {
  const raw = form.content_nodes_json.trim()
  if (!raw) return []
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('CONTENT_NODES 不是合法 JSON')
  }
  if (Array.isArray(parsed)) return parsed as any[]
  if (parsed && typeof parsed === 'object') return [parsed as any]
  throw new Error('CONTENT_NODES 必须是对象或数组')
}

function fillForm(item: MpPosterItem) {
  form.title = item.title || ''
  form.poster_url = item.poster_url || ''
  form.poster_width = Number(item.poster_width) || 0
  form.poster_height = Number(item.poster_height) || 0
  form.poster_ratio = Number(item.poster_ratio) || 0
  form.status = (item.status || 'draft') as MpPosterStatus
  form.weight = Number(item.weight || 0)
  form.published_at = item.published_at || ''
  try {
    const nodes = Array.isArray(item.content_nodes) ? item.content_nodes : []
    form.content_nodes_json = formatNodesJSON(nodes)
    setEditorHTML(nodesToHTML(nodes as MpPosterRichTextNode[]))
  } catch {
    form.content_nodes_json = '[]'
    setEditorHTML('<p></p>')
  }
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
      placeholder: '开始写正文富文本内容...',
    }),
  ],
  content: '<p></p>',
  editorProps: {
    attributes: {
      class: 'tiptap prose max-w-none min-h-[320px] outline-none text-zinc-800',
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

function effectivePosterUrl() {
  const base = getApiBase()
  const u = form.poster_url.trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  return base + u
}

async function load() {
  if (!id.value) return
  loading.value = true
  errorText.value = ''
  try {
    const res = await fetchPosterDetail(id.value)
    baseUrl.value = getApiBase()
    original.value = res.item
    fillForm(res.item)
  } catch (e: any) {
    errorText.value = String(e?.message || e || '加载失败')
  } finally {
    loading.value = false
  }
}

const previewNodes = computed(() => {
  try {
    return parseNodes()
  } catch {
    return []
  }
})

function buildPayload() {
  const tags: any[] = []
  try {
    tags.push(...parseNodes())
  } catch {}
  return {
    title: form.title.trim(),
    poster_url: form.poster_url.trim(),
    poster_width: Number(form.poster_width) || 0,
    poster_height: Number(form.poster_height) || 0,
    poster_ratio: Number(form.poster_ratio) || 0,
    status: form.status,
    weight: Number.isFinite(Number(form.weight)) ? Number(form.weight) : 0,
    content_format: 'RICH_TEXT_NODES',
    content_text: '',
    content_nodes: tags,
    published_at: form.published_at.trim() || null,
  }
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
    setEditorHTML(nodesToHTML(previewNodes.value as MpPosterRichTextNode[]))
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

function onPickPosterFile() {
  posterFileInput.value?.click()
}

async function onPosterFileChanged(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input?.files?.[0]
  if (!file) return

  let localWidth = 0
  let localHeight = 0
  try {
    const dim = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = window.document.createElement('img')
      const url = URL.createObjectURL(file)
      img.onload = () => {
        resolve({ w: Number(img.naturalWidth) || 0, h: Number(img.naturalHeight) || 0 })
        URL.revokeObjectURL(url)
      }
      img.onerror = () => {
        reject(new Error('img_load_failed'))
        URL.revokeObjectURL(url)
      }
      img.src = url
    })
    localWidth = dim.w
    localHeight = dim.h
  } catch (e) {
    console.warn('[poster] 本地读取尺寸失败，将使用后端返回值', e)
  }

  uploading.value = true
  errorText.value = ''
  try {
    const res = await uploadPosterImage(file)
    form.poster_url = res.url || ''
    const w = Number(res.width) || localWidth || 0
    const h = Number(res.height) || localHeight || 0
    form.poster_width = w
    form.poster_height = h
    form.poster_ratio = w > 0 && h > 0 ? Number((w / h).toFixed(6)) : 0
    Message.success(
      `海报上传成功：${w} × ${h}${form.poster_ratio ? `，比例 ${form.poster_ratio.toFixed(3)}` : ''}`,
    )
  } catch (e: any) {
    const msg = String(e?.message || e || '上传失败')
    errorText.value = msg
    Message.error(msg)
  } finally {
    uploading.value = false
    if (posterFileInput.value) posterFileInput.value.value = ''
  }
}

function onRemovePoster() {
  form.poster_url = ''
  form.poster_width = 0
  form.poster_height = 0
  form.poster_ratio = 0
}

async function save() {
  saving.value = true
  errorText.value = ''
  try {
    const payload = buildPayload()
    if (!payload.title) {
      throw new Error('标题不能为空')
    }
    if (id.value) {
      await updatePoster(id.value, payload)
    } else {
      const res = await createPoster(payload)
      Message.success('已保存')
      router.replace({ name: 'poster-edit', params: { id: String(res.item.id) } })
      await nextTick()
      await load()
      saving.value = false
      return
    }
    Message.success('已保存')
    await load()
  } catch (e: any) {
    const msg = String(e?.message || e || '保存失败')
    errorText.value = msg
    Message.error(msg)
  } finally {
    saving.value = false
  }
}

function goList() {
  router.push({ name: 'poster-list' })
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
        <div class="text-xs uppercase tracking-[0.24em] text-zinc-400">Poster Studio</div>
        <div class="text-sm text-zinc-700">海报 + 富文本 编辑页</div>
      </div>
      <div class="flex gap-2">
        <Button type="default" @click="goList">返回列表</Button>
        <Button type="primary" :loading="saving" @click="save">保存海报</Button>
      </div>
    </div>

    <Alert v-if="errorText" type="error" show-icon>{{ errorText }}</Alert>

    <div class="grid grid-cols-12 gap-4">
      <div class="col-span-12 xl:col-span-8">
        <div class="notion-doc px-6 py-8 md:px-10">
          <div class="mb-6">
            <input v-model="form.title" class="notion-title-input" placeholder="海报标题（用于后台管理标识）" />
          </div>

          <div class="mt-8 border-t border-zinc-200 pt-6">
            <div class="notion-label mb-3">正文富文本</div>
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
              </div>
              <div class="notion-field min-h-[320px] px-4 py-4">
                <EditorContent :editor="editor" />
              </div>
            </div>
            <textarea
              v-else
              v-model="form.content_nodes_json"
              class="notion-field notion-textarea font-mono text-[12px]"
              style="min-height: 320px"
              placeholder="编辑 RichText Nodes JSON"
            />
          </div>
        </div>
      </div>

      <div class="col-span-12 xl:col-span-4 space-y-4">
        <div class="notion-sidebar p-5">
          <div class="text-sm font-semibold text-zinc-900">海报属性</div>
          <div class="mt-4 space-y-4">
            <div>
              <div class="notion-label mb-2">状态</div>
              <Select v-model="form.status">
                <Option value="draft">草稿</Option>
                <Option value="published">已发布</Option>
                <Option value="offline">已下线</Option>
              </Select>
            </div>
            <div>
              <div class="notion-label mb-2">权重（数值越大越优先展示）</div>
              <Input v-model.number="form.weight" type="number" placeholder="例如 100" />
            </div>
            <div>
              <div class="notion-label mb-2">发布时间（可选）</div>
              <Input v-model="form.published_at" placeholder="RFC3339 时间，留空则不设置" />
            </div>
          </div>
        </div>

        <div class="notion-sidebar p-5">
          <div class="flex items-center justify-between">
            <div class="text-sm font-semibold text-zinc-900">海报图片</div>
            <div v-if="form.poster_width && form.poster_height" class="text-xs text-zinc-500">
              {{ form.poster_width }} × {{ form.poster_height }}
              <span v-if="form.poster_ratio" class="ml-2">
                比例 {{ form.poster_ratio.toFixed(3) }}
              </span>
            </div>
          </div>
          <div class="mt-4 space-y-4">
            <div>
              <div
                class="rounded-xl border border-zinc-200 bg-zinc-50 p-3 flex items-center justify-center overflow-hidden"
                :style="
                  form.poster_ratio > 0
                    ? `aspect-ratio: ${form.poster_ratio} / 1; max-height: 380px;`
                    : 'max-height: 380px; min-height: 160px;'
                "
              >
                <img
                  v-if="effectivePosterUrl()"
                  :src="effectivePosterUrl()"
                  class="max-w-full max-h-full object-contain block rounded-lg"
                  alt="poster-preview"
                />
                <div v-else class="text-xs text-zinc-400 text-center px-4">
                  上传海报图片后，这里会按照比例显示预览
                </div>
              </div>
            </div>
            <div class="flex gap-2 flex-wrap">
              <Button type="primary" :loading="uploading" @click="onPickPosterFile">
                上传海报
              </Button>
              <Button
                v-if="form.poster_url"
                type="outline"
                style="border-color: #ff4d4f; color: #ff4d4f;"
                @click="onRemovePoster"
              >
                移除
              </Button>
            </div>
            <div class="text-xs text-zinc-400 leading-5">
              建议使用长方形图片（例如 3:4 竖版或 16:9 横版）。上传时会自动识别像素尺寸和宽高比例，小程序中的 FAB 浮窗将按此比例渲染。
            </div>
            <input
              ref="posterFileInput"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              class="hidden"
              @change="onPosterFileChanged"
            />
          </div>
        </div>

        <div class="notion-sidebar p-5">
          <div class="text-sm font-semibold text-zinc-900">实时预览</div>
          <div class="mt-4 space-y-3">
            <div class="text-xl font-semibold leading-tight text-zinc-900">
              {{ form.title || '未命名海报' }}
            </div>
            <div class="text-xs text-zinc-500">
              状态：{{ form.status === 'published' ? '已发布' : form.status === 'offline' ? '已下线' : '草稿' }}
              · 权重 {{ form.weight }}
            </div>
            <div
              v-if="effectivePosterUrl()"
              class="rounded-xl overflow-hidden border border-zinc-200 bg-white"
              :style="form.poster_ratio > 0 ? `aspect-ratio: ${form.poster_ratio} / 1;` : ''"
            >
              <img
                :src="effectivePosterUrl()"
                class="w-full h-full object-cover block"
                alt="poster-thumb"
              />
            </div>
            <div class="rounded-xl border border-zinc-200 bg-white p-4">
              <RichTextRenderer v-if="previewNodes.length" :nodes="previewNodes" :base-url="baseUrl" />
              <div v-else class="text-sm text-zinc-400">等待合法的 RichText JSON</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
