# Admin V2

这是基于旧版 `./admin` 功能梳理后重写的一版后台原型，目标不是简单换皮，而是重组信息架构：

- 把旧版 `概览 / 新闻 / 设备 / 用户 / 设置 / F1 Live Timing Demo / Live Standings Demo` 收敛为统一工作台
- 将 `列表页 + 详情页 + 编辑页` 尽量合并到单屏工作流中
- 保留原有接口路径与本地设置习惯，降低接入成本

## 保留的旧版能力

- 新闻列表筛选、详情预览、Hero / Banner 设置、基础元信息编辑
- 设备列表、设备详情、绑定用户查看、手动绑定 / 解绑
- 用户列表、用户详情、绑定设备查看、反向绑定 / 解绑
- F1 Live Timing 预览
- Motorsport Live Standings 抓取调试
- API Base / Token / 时区配置

## 启动方式

```bash
npm install
npm run dev
```

## 默认约定

- `API Base` 留空时按同域请求
- `Token` 会自动追加到需要鉴权的接口 query 中
- 时区默认 `Asia/Shanghai`
- 支持浅色 / 深色主题切换
