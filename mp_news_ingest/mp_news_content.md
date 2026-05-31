# mp_news content（正文）字段说明

本文描述资讯文章 `content` 对象的字段含义、推荐填充方式，以及 `content.nodes`（小程序 rich-text nodes）的详细结构约定。

相关实现参考：

- 模型：[/backend/internal/model/mp_news.go](file:///c:/F1InkDashboard/backend/internal/model/mp_news.go)
- 入库逻辑：[/backend/internal/httpserver/handlers/mp_news_ingest.go](file:///c:/F1InkDashboard/backend/internal/httpserver/handlers/mp_news_ingest.go)

## content 对象

```jsonc
{
  "format_code": "RICH_TEXT_NODES",
  "text": "纯文本正文...",
  "nodes": []
}
```

### format_code

- 类型：`string`
- 作用：标识正文的组织形式，便于前端选择渲染策略
- 入库行为：
  - 不传/传空：服务端会默认写入 `"PLAIN"`
  - 传非空：原样写入 `content_format_code`
- 推荐取值（约定）：
  - `PLAIN`：纯文本为主（配合 `text`）
  - `RICH_TEXT_NODES`：富文本 nodes 为主（配合 `nodes`）

说明：当前后端未对 `format_code` 做枚举强校验；但建议严格按上述约定输出，避免前端分支爆炸。

### text

- 类型：`string`
- 作用：纯文本正文（写入 MySQL `content_text`）
- 推荐如何获取：
  - 从网页正文抽取后做基础清洗：去脚注/广告/导航、合并多余空白、按自然段落加入换行
  - 若使用 `nodes` 渲染，也可同步保留一份 `text` 用于：
    - 搜索索引/关键词抽取
    - 旧版本客户端降级展示

### nodes

- 类型：`[]MpNewsRichTextNode`
- 作用：小程序 `rich-text` 组件可直接消费的富文本结构（写入 MySQL `content_nodes` JSON）
- 入库行为：
  - `nodes` 为空数组或不传：入库为 `NULL`
  - `nodes` 非空：服务端 `json.Marshal(nodes)` 后写入
  - 若 JSON 序列化失败：服务端会记录错误，但不会直接拒绝请求；最终可能写入 `NULL`

## rich-text nodes 结构

### 节点通用结构

```jsonc
{
  "name": "p",
  "type": "",
  "text": "",
  "attrs": {},
  "children": []
}
```

字段说明（与后端结构体一致）：

- `name`：元素节点名（例如 `p`、`img`、`a`、`strong` 等）
- `type`：节点类型（目前主要使用 `text` 作为文本节点标识）
- `text`：文本内容（当 `type=="text"` 时使用）
- `attrs`：节点属性（如 `src`、`href`、`style`、`mode` 等）
- `children`：子节点（数组；见下文“children 兼容输入”）

### 元素节点 vs 文本节点

#### 元素节点（推荐）

用 `name` 表示元素；正文段落一般用 `p`：

```jsonc
{
  "name": "p",
  "children": [
    { "type": "text", "text": "第一段内容……" }
  ]
}
```

#### 文本节点

```jsonc
{ "type": "text", "text": "一段纯文本" }
```

### children 兼容输入（服务端反序列化支持）

后端为了兼容爬虫/转换器输出，对 `children` 的 JSON 输入做了“宽松兼容”（解析逻辑在 `MpNewsRichTextChildren.UnmarshalJSON`）：

#### 1) 数组（推荐）

```jsonc
{ "name": "p", "children": [ { "type": "text", "text": "..." } ] }
```

#### 2) 字符串（兼容）

```jsonc
{ "name": "p", "children": "..." }
```

服务端会把它转换为：

```jsonc
{ "name": "p", "children": [ { "type": "text", "text": "..." } ] }
```

#### 3) 单对象（兼容）

```jsonc
{ "name": "p", "children": { "type": "text", "text": "..." } }
```

服务端会把它转换为单元素数组。

建议：爬虫侧统一输出数组，避免不同来源输出形态不一致，增加调试成本。

## 常见节点约定（推荐）

说明：后端不限制 `name/attrs` 的具体取值；以下为推荐约定，便于前端一致渲染。

### 段落 p

```jsonc
{
  "name": "p",
  "children": [
    { "type": "text", "text": "段落文本..." }
  ]
}
```

### 换行 br（可选）

```jsonc
{ "name": "br" }
```

### 加粗 strong（可选）

```jsonc
{
  "name": "strong",
  "children": [
    { "type": "text", "text": "加粗文本" }
  ]
}
```

### 斜体 em（可选）

```jsonc
{
  "name": "em",
  "children": [
    { "type": "text", "text": "斜体文本" }
  ]
}
```

### 超链接 a（可选）

```jsonc
{
  "name": "a",
  "attrs": { "href": "https://example.com" },
  "children": [
    { "type": "text", "text": "链接文本" }
  ]
}
```

### 图片 img

```jsonc
{
  "name": "img",
  "attrs": {
    "src": "https://example.com/a.jpg",
    "mode": "widthFix",
    "style": "width:100%;display:block;"
  }
}
```

#### img.attrs 建议字段

- `src`（必填）：图片地址
  - 建议输出“纯 URL 字符串”，不要带反引号或多余空格
  - 允许相对路径（如 `/static/news/xx.webp`），前端可用接口返回的 `base_url` 补全
- `mode`（可选）：小程序 `image` 的 mode，例如 `widthFix`
- `style`（可选）：行内样式字符串（前端可选择是否启用）

## 爬虫/转换器推荐输出策略

- 优先输出 `nodes`：把 HTML 转成 `p/img/a/strong/em/br` 等基础节点即可满足大多数资讯内容
- 同时输出 `text`：作为降级与检索用途（尤其是图片较多/富文本结构复杂时）
- 输出规范化：
  - 统一 trim 字段值（尤其是 URL：不要出现 `" https://... "` 这种带空格的内容）
  - children 统一输出数组形式

