# Application 与启动主循环

本文描述 `Application` 作为框架“中枢状态机/事件循环”的职责、如何驱动 Board/Display/OTA/Sleep，以及新增业务时应放在哪一层。

## 代码入口

- 入口： [main.cc](file:///c:/F1InkDashboard/main/main.cc)
- 主循环： [application.cc](file:///c:/F1InkDashboard/main/application.cc) / [application.h](file:///c:/F1InkDashboard/main/application.h)
- 主页面/策略抽象： [app_profile.h](file:///c:/F1InkDashboard/main/app_profile.h)

## 职责边界

- **负责**
  - 维护设备状态 `DeviceState`（Starting/Idle/Recovery 等）
  - 通过 queue 收敛系统级事件：联网/断网/进入恢复/周期 Tick
  - 在 Tick 中驱动“全局策略”：状态栏刷新、低电提示、light sleep 判定
  - 将“联网/断网”转交给后台服务：OTA、时间同步（由 Board/服务各自触发）
- **不负责**
  - 不直接操作具体页面的 LVGL 控件（交给 `Display/LcdDisplay` 与页面适配器）
  - 不包含业务协议解析/业务页面逻辑（后续应该下沉到业务层或产品层）

## 事件模型

`Application` 使用内部 `AppEvent`（queue）来避免各模块直接在中断/回调线程里做复杂逻辑。

事件类型见 [Application::AppEventType](file:///c:/F1InkDashboard/main/application.h)：

- `NetworkConnected` / `NetworkDisconnected`
- `EnterRecovery` / `EnterNormal`
- `Tick`（通过超时触发）

## 启动流程（ASCII）

```
app_main()
  |
  +--> Application::Initialize()
  |      |
  |      +--> Board::GetInstance()
  |      +--> 初始化音频/Display/事件队列
  |      +--> board.EnterNormalFlow() / EnterFactoryTestFlow()
  |
  +--> Application::Run()  (while true)
         |
         +--> xQueueReceive(AppEvent, timeout=1s)
                | got
                |   +--> HandleEvent()
                |         - 联网: OtaUpdateService::NotifyNetworkConnected()
                |         - 断网: OtaUpdateService::NotifyNetworkDisconnected()
                |         - 恢复/正常: board.EnterRecoveryFlow()/EnterNormalFlow()
                |
                + timeout
                    +--> Tick()
                         - display.UpdateStatusBar()
                         - 电量检查/低电提示
                         - 允许时进入 light sleep
```

## light sleep 的“主页面”解耦

`Application::Tick()` 里需要判断“当前页面是否允许进入 light sleep”。该判断通过 `app_profile` 抽象，避免写死业务页面：

- `AllowLightSleepWhenActivePage(active_page_id)` 见 [app_profile.cc](file:///c:/F1InkDashboard/main/app_profile.cc)

新增业务时的推荐做法：

- **业务 A** 与 **业务 B** 切换主页面：只改 `GetMainUiPageId()` 的策略或做成可配置（例如 NVS 里 `product.active=...`）。
- 不在 `Application` 里直接写 `if (pid == UiPageId::Xxx)` 这种业务判断。

## 常见扩展点（推荐落点）

- 需要新增“后台服务任务”：放在 `main/common/*` 或 `products/<name>/services/*`，由 `Application` 或 `Board` 触发启动。
- 需要新增“系统级 UI 提示”：通过 `Display` 的抽象 API（例如通知、overlay）触发，而不是直接改页面控件。

