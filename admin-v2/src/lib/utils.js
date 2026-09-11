export function formatDateTime(value, timezone = 'Asia/Shanghai') {
    if (!value)
        return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleString('zh-CN', { timeZone: timezone || 'Asia/Shanghai' });
}
export function formatShort(value, timezone = 'Asia/Shanghai') {
    if (!value)
        return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return value;
    return date.toLocaleString('zh-CN', {
        timeZone: timezone || 'Asia/Shanghai',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}
export function escapeHtml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
export function renderRichNode(node, seen, depth = 0) {
    if (!node || typeof node !== 'object' || depth > 32)
        return '';
    const visited = seen ?? new WeakSet();
    if (visited.has(node))
        return '';
    visited.add(node);
    const tag = String(node.name || node.type || 'p').toLowerCase();
    const childNodes = node.children;
    let children = '';
    if (Array.isArray(childNodes)) {
        children = childNodes.map((c) => renderRichNode(c, visited, depth + 1)).join('');
    }
    else if (typeof childNodes === 'string') {
        children = escapeHtml(childNodes);
    }
    else if (childNodes && typeof childNodes === 'object') {
        children = renderRichNode(childNodes, visited, depth + 1);
    }
    else {
        children = escapeHtml(String(node.text || ''));
    }
    if (tag === 'text')
        return escapeHtml(String(node.text || ''));
    if (tag === 'bullet_list' || tag === 'ul')
        return `<ul>${children}</ul>`;
    if (tag === 'ordered_list' || tag === 'ol')
        return `<ol>${children}</ol>`;
    if (tag === 'list_item' || tag === 'li')
        return `<li>${children}</li>`;
    if (tag === 'heading' || tag === 'h2' || tag === 'h3')
        return `<h3>${children}</h3>`;
    if (tag === 'blockquote')
        return `<blockquote>${children}</blockquote>`;
    if (tag === 'paragraph' || tag === 'p')
        return `<p>${children}</p>`;
    return `<p>${children}</p>`;
}
export function renderNewsContent(item) {
    if (!item?.content)
        return '<p>暂无内容</p>';
    if (item.content.format_code === 'RICH_TEXT_NODES' && item.content.nodes?.length) {
        return item.content.nodes.map((n) => renderRichNode(n)).join('');
    }
    return String(item.content.text || '')
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br />')}</p>`)
        .join('');
}
