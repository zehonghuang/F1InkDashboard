<script setup lang="ts">
import { computed } from 'vue'
import type { MpNewsRichTextNode } from '@/api/mpNews'

defineOptions({ name: 'RichTextNode' })

const props = defineProps<{ node: MpNewsRichTextNode; baseUrl?: string }>()

const isText = computed(() => String(props.node?.type || '') === 'text')

function safeUrl(raw: string) {
  const s = raw.trim()
  if (!s) return ''
  if (s.startsWith('/')) return s
  if (s.startsWith('#')) return s
  if (s.startsWith('http://') || s.startsWith('https://')) return s
  return ''
}

function joinURL(base: string, p: string) {
  const b = (base || '').trim().replace(/\/+$/, '')
  if (!b) return p
  if (!p.startsWith('/')) return p
  return b + p
}

const tagName = computed(() => {
  const name = String(props.node?.name || '').toLowerCase()
  const allowed = new Set([
    'p',
    'span',
    'div',
    'strong',
    'em',
    'b',
    'i',
    'u',
    'a',
    'img',
    'br',
    'ul',
    'ol',
    'li',
    'blockquote',
    'h1',
    'h2',
    'h3',
  ])
  if (!name) return 'span'
  if (!allowed.has(name)) return 'span'
  return name
})

const attrs = computed(() => {
  const out: Record<string, string> = {}
  const raw = (props.node?.attrs || {}) as Record<string, any>
  const style = typeof raw.style === 'string' ? raw.style.trim() : ''
  if (style) out.style = style

  if (tagName.value === 'a') {
    const hrefRaw = typeof raw.href === 'string' ? raw.href : ''
    const href = safeUrl(hrefRaw)
    if (href) {
      out.href = href
      out.target = '_blank'
      out.rel = 'noopener noreferrer'
    }
  }

  if (tagName.value === 'img') {
    const srcRaw = typeof raw.src === 'string' ? raw.src : ''
    const srcSafe = safeUrl(srcRaw)
    const src = srcSafe ? joinURL(props.baseUrl || '', srcSafe) : ''
    if (src) out.src = src
    out.loading = 'lazy'
  }

  return out
})

const children = computed<MpNewsRichTextNode[]>(() => {
  const c: any = props.node?.children
  if (!c) return []
  if (typeof c === 'string') {
    const s = c.trim()
    return s ? [{ type: 'text', text: s }] : []
  }
  if (Array.isArray(c)) return c as MpNewsRichTextNode[]
  if (typeof c === 'object') return [c as MpNewsRichTextNode]
  return []
})
</script>

<template>
  <template v-if="isText">{{ node.text }}</template>
  <component v-else :is="tagName" v-bind="attrs">
    <template v-if="tagName !== 'img' && tagName !== 'br'">
      <RichTextNode v-for="(c, idx) in children" :key="idx" :node="c" :base-url="baseUrl" />
    </template>
  </component>
</template>
