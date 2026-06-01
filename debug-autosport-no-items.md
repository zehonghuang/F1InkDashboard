# Debug Session: autosport-no-items
- **Status**: [OPEN]
- **Issue**: autosport 抓取已进入交互验证/已生成 storage_state，但最终没有落盘新文章（RSS 解析为空或候选为空）
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-autosport-no-items.ndjson

## Reproduction Steps
1. 安装依赖：`httpx`、`playwright`、`chromium`
2. 运行：`python mp_news_ingest/crawl_autosport_html.py --fetch-mode playwright --max-items 10 --storage-state mp_news_ingest/state/autosport_playwright_state.json`
3. 若仍弹出人机验证页，改用：`--interactive`，完成验证后回车继续

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | RSS 请求返回的是“人机验证页面/非 XML”，导致 RSS 解析结果为空 | High | Low | Pending |
| B | 返回是 XML 但结构不符合解析器（channel/item 或 atom entry），导致解析结果为空 | Med | Low | Pending |
| C | RSS 有内容，但都被 state（last_url/seen_urls）过滤掉，导致 to_fetch 为空 | Med | Low | Pending |
| D | RSS 可解析且有新项，但文章页抓取阶段仍被拦截/失败，导致最终无落盘 | Med | Med | Pending |

## Log Evidence
[Key log entries]

## Verification Conclusion
[Pre vs Post]
