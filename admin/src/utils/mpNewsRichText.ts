import type { MpNewsItem, MpNewsRichTextNode } from '@/api/mpNews'

export const F1_SHOP_CARD_TAG = 'f1-shop-card'

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function attrsToHTML(attrs?: Record<string, any>) {
  if (!attrs) return ''
  const allowed = ['href', 'src', 'style', 'data-product-id', 'data-size']
  const out: string[] = []
  for (const key of allowed) {
    const value = String(attrs[key] ?? '').trim()
    if (!value) continue
    out.push(` ${key}="${escapeHtml(value)}"`)
  }
  return out.join('')
}

function childrenToHTML(children?: MpNewsRichTextNode[] | string | MpNewsRichTextNode): string {
  if (!children) return ''
  if (typeof children === 'string') return escapeHtml(children)
  if (Array.isArray(children)) return children.map(nodeToHTML).join('')
  return nodeToHTML(children)
}

export function isShopCardNode(node: MpNewsRichTextNode | null | undefined): boolean {
  if (!node) return false
  const tag = String(node.name || '').toLowerCase()
  return tag === F1_SHOP_CARD_TAG
}

export function getShopCardProductID(node: MpNewsRichTextNode): string {
  const attrs = (node?.attrs || {}) as Record<string, any>
  const a = typeof attrs['data-product-id'] === 'string' ? attrs['data-product-id'] : ''
  return a.trim()
}

export function buildShopCardNode(productID: string): MpNewsRichTextNode {
  return {
    name: F1_SHOP_CARD_TAG,
    attrs: { 'data-product-id': String(productID || '').trim() },
  }
}

export const SHOP_CARD_HOLDER_CLASS = 'f1-shop-card-placeholder'

export function nodeToHTML(node: MpNewsRichTextNode): string {
  if (!node) return ''
  if (String(node.type || '').toLowerCase() === 'text') {
    return escapeHtml(String(node.text || ''))
  }

  const tag = String(node.name || 'span').toLowerCase()
  const attrs = attrsToHTML(node.attrs)
  if (tag === F1_SHOP_CARD_TAG) {
    const pid = getShopCardProductID(node)
    const holder = `<div class="${SHOP_CARD_HOLDER_CLASS}" contenteditable="false" data-product-id="${escapeHtml(pid)}"><div class="${SHOP_CARD_HOLDER_CLASS}__title">F1 商品卡片 · ID <code>${escapeHtml(pid || '?')}</code></div><div class="${SHOP_CARD_HOLDER_CLASS}__hint">（保存后在新闻预览 / 小程序资讯详情页显示真实商品）</div></div>`
    return holder
  }
  const selfClosing = new Set(['img', 'br'])
  if (selfClosing.has(tag)) return `<${tag}${attrs}>`
  return `<${tag}${attrs}>${childrenToHTML(node.children)}</${tag}>`
}

export function nodesToHTML(nodes?: MpNewsRichTextNode[]) {
  return (nodes || []).map(nodeToHTML).join('')
}

export function plainTextToHTML(text: string) {
  const parts = String(text || '')
    .split(/\n{2,}/)
    .map((it) => it.trim())
    .filter(Boolean)
  if (!parts.length) return '<p></p>'
  return parts
    .map((it) => `<p>${escapeHtml(it).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function elementToNode(el: Element): MpNewsRichTextNode[] {
  const tag = el.tagName.toLowerCase()
  const richAllowed = new Set([
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
  const childNodes = domNodesToMpNodes(Array.from(el.childNodes))

  if (tag === F1_SHOP_CARD_TAG) {
    const pid = el.getAttribute('data-product-id')
    const attrs: Record<string, string> = {}
    if (pid) attrs['data-product-id'] = pid.trim()
    const sizeAttr = el.getAttribute('data-size')
    if (sizeAttr) attrs['data-size'] = sizeAttr.trim()
    return [{ name: F1_SHOP_CARD_TAG, attrs: Object.keys(attrs).length ? attrs : undefined }]
  }

  if (el.classList && el.classList.contains(SHOP_CARD_HOLDER_CLASS)) {
    const pid = el.getAttribute('data-product-id')
    const attrs: Record<string, string> = {}
    if (pid) attrs['data-product-id'] = pid.trim()
    return [{ name: F1_SHOP_CARD_TAG, attrs: Object.keys(attrs).length ? attrs : undefined }]
  }

  if (!richAllowed.has(tag)) return childNodes

  const attrs: Record<string, string> = {}
  for (const key of ['href', 'src', 'style']) {
    const value = el.getAttribute(key)
    if (value) attrs[key] = value
  }
  const node: MpNewsRichTextNode = {
    name: tag,
    attrs: Object.keys(attrs).length ? attrs : undefined,
  }
  if (tag !== 'img' && tag !== 'br' && childNodes.length) {
    node.children = childNodes
  }
  return [node]
}

export function domNodesToMpNodes(nodes: Node[]): MpNewsRichTextNode[] {
  const out: MpNewsRichTextNode[] = []
  for (const n of nodes) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent || ''
      if (text) out.push({ type: 'text', text })
      continue
    }
    if (n.nodeType !== Node.ELEMENT_NODE) continue
    out.push(...elementToNode(n as Element))
  }
  return out
}

export function htmlToMpNodes(html: string) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  return domNodesToMpNodes(Array.from(doc.body.childNodes))
}

export function itemContentToHTML(item: MpNewsItem | null) {
  const content = item?.content
  if (!content) return '<p></p>'
  if (content.format_code === 'RICH_TEXT_NODES') return nodesToHTML(content.nodes)
  return plainTextToHTML(content.text || '')
}
