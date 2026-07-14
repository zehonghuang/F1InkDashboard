# TOINC F1 小程序前端

## 开发说明

1. 在 `miniprogram/` 目录执行依赖安装：

```bash
npm install
```

2. 安装完成后会自动生成 `miniprogram_npm/`（用于小程序组件引用）。如果你希望由开发者工具重新构建，也可以执行「工具 -> 构建 NPM」。

3. 默认包含 3 个 Tab：
   - 归档：遥测数据归档入口（含 2026 赛季示例列表）
   - 对比：全局性能对比入口
   - 我的：个人配置入口（占位）

4. 微信小店配置统一放在 `services/wechatStore.js`，当前已接入的目标 `appId` 为 `wx09ead34ea6955f43`。`pages/shop/index` 现已改为内嵌 `store-home` 组件，而不是简单跳转小店小程序。

## UI 框架

使用 `iview-weapp`（iViewUI 的小程序组件库）。页面的 `usingComponents` 指向 `miniprogram_npm/iview-weapp/dist/...`。

## TabBar 图标

使用自定义 TabBar（[custom-tab-bar](file:///c:/Users/GinTonic/Desktop/zectrix/miniprogram/custom-tab-bar)）展示底部导航，并使用本地 PNG 图标（`assets/tabbar/*`）。

图标会由脚本自动生成/更新：

```bash
npm run prepare:mp
```
