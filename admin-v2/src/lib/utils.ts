import type { MpNewsItem, MpNewsRichTextNode } from '@/api'

export function formatDateTime(value?: string, timezone = 'Asia/Shanghai') {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' })
}

export function formatShort(value?: string, timezone = 'Asia/Shanghai') {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
    timeZone: timezone || 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function renderRichNode(node: MpNewsRichTextNode): string {
  const tag = String(node.name || node.type || 'p').toLowerCase()
  const children = Array.isArray(node.children)
    ? node.children.map(renderRichNode).join('')
    : typeof node.children === 'string'
      ? escapeHtml(node.children)
      : node.children && typeof node.children === 'object'
        ? renderRichNode(node.children)
        : escapeHtml(node.text || '')

  if (tag === 'text') return escapeHtml(node.text || '')
  if (tag === 'bullet_list' || tag === 'ul') return `<ul>${children}</ul>`
  if (tag === 'ordered_list' || tag === 'ol') return `<ol>${children}</ol>`
  if (tag === 'list_item' || tag === 'li') return `<li>${children}</li>`
  if (tag === 'heading' || tag === 'h2' || tag === 'h3') return `<h3>${children}</h3>`
  if (tag === 'blockquote') return `<blockquote>${children}</blockquote>`
  if (tag === 'paragraph' || tag === 'p') return `<p>${children}</p>`
  return `<p>${children}</p>`
}

export function renderNewsContent(item: MpNewsItem | null) {
  if (!item?.content) return '<p>暂无内容</p>'
  if (item.content.format_code === 'RICH_TEXT_NODES' && item.content.nodes?.length) {
    return item.content.nodes.map(renderRichNode).join('')
  }
  return String(item.content.text || '')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br />')}</p>`)
    .join('')
}
