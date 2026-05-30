```jsonc
// GET /api/v1/mp/news (List)
{
  "ok": true, // 是否成功
  "generated_at_utc": "2026-05-30T12:34:56.789123Z", // 服务端生成响应时间(UTC, RFC3339Nano)
  "tz": "Asia/Shanghai", // 本次用于 time_text 计算的时区(由 query.tz 决定)
  "base_url": "https://winpc-f1.normal-person.icu", // 服务端推断的 base_url(前端可用于补全 cover_url 等相对路径)
  "page": 1, // 页码(>=1)
  "page_size": 20, // 每页条数(1~50)
  "total": 123, // 全量条数
  "items": [
    {
      "id": "n_f1_antonelli_russell_wolff", // 文章唯一 ID(用于详情接口 /api/v1/mp/news/:id)
      "layout_code": "FEATURE", // 卡片布局类型(BREAKING/HERO/FEATURE/STANDARD 等)
      "hero_display_code": "BANNER", // HERO 展示类型(仅 layout_code=HERO 时有意义；可省略)
      "type_code": "PADDOCK", // 内容类型(PADDOCK/REGULATION 等)
      "pinned": false, // 是否置顶
      "weight": 880, // 排序权重(越大越靠前；与 pinned/published_at 一起决定排序)
      "tag_text": "Mercedes / 采访", // 卡片标签文案(展示用)
      "tags": ["mercedes", "44"], // 可选：结构化标签(用于偏好命中/搜索等；可省略)
      "title": "沃尔夫谈队内竞争：允许安东内利与拉塞尔硬碰硬，但会设底线", // 标题
      "summary": "基于 Formula1.com 报道要点的中文改写：既鼓励公平竞争，也强调团队利益优先。", // 摘要
      "cover_url": "/static/news/f1-wolff-antonelli-russell.webp", // 封面图(可为相对路径；前端可用 base_url 补全)
      "published_at": "2026-05-25T18:30:00+08:00", // 发布时间(RFC3339，建议带时区)
      "time_text": "2 天前" // 相对时间文案(由后端根据 tz 动态生成)
    }
  ]
}
```

```jsonc
// GET /api/v1/mp/news/:id (Detail)
{
  "ok": true, // 是否成功
  "generated_at_utc": "2026-05-30T12:34:56.789123Z", // 服务端生成响应时间(UTC, RFC3339Nano)
  "tz": "Asia/Shanghai", // 本次用于 time_text 计算的时区(由 query.tz 决定)
  "base_url": "https://winpc-f1.normal-person.icu", // 服务端推断的 base_url(前端可用于补全 cover_url / 富文本图片等相对路径)
  "item": {
    "id": "n_f1_antonelli_russell_wolff", // 文章唯一 ID
    "layout_code": "FEATURE", // 卡片布局类型
    "hero_display_code": "BANNER", // HERO 展示类型(可省略)
    "type_code": "PADDOCK", // 内容类型
    "pinned": false, // 是否置顶
    "weight": 880, // 排序权重
    "tag_text": "Mercedes / 采访", // 卡片标签文案
    "tags": ["mercedes", "44"], // 可选：结构化标签
    "title": "沃尔夫谈队内竞争：允许安东内利与拉塞尔硬碰硬，但会设底线", // 标题
    "summary": "基于 Formula1.com 报道要点的中文改写：既鼓励公平竞争，也强调团队利益优先。", // 摘要
    "cover_url": "/static/news/f1-wolff-antonelli-russell.webp", // 封面图
    "published_at": "2026-05-25T18:30:00+08:00", // 发布时间(RFC3339，建议带时区)
    "time_text": "2 天前", // 相对时间文案(由后端根据 tz 动态生成)
    "source": {
      "name": "Formula1.com", // 来源名称(展示用)
      "url": "https://www.formula1.com/en/latest/article/..." // 来源链接(可选)
    },
    "content": {
      "format_code": "RICH_TEXT_NODES", // 正文格式(例如 RICH_TEXT_NODES / PLAIN)
      "text": "纯文本正文...", // 当 format_code=PLAIN 时使用(可省略)
      "nodes": [
        {
          "name": "p", // 节点名(对齐 rich-text nodes 规范)
          "attrs": {
            "style": "..." // 节点属性(可选)：style/href/src/mode 等
          },
          "children": [
            {
              "type": "text", // 子节点类型(text)
              "text": "段落文本..." // 文本内容
            }
          ]
        },
        {
          "name": "img", // 图片节点
          "attrs": {
            "src": "/static/news/f1-wolff-antonelli-russell.webp", // 图片地址(可为相对路径；前端可用 base_url 补全)
            "mode": "widthFix", // image mode(可选)
            "style": "width:100%;display:block;..." // 行内样式(可选)
          }
        }
      ]
    }
  }
}
```
