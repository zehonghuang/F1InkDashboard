# 音频服务（AudioService）

本文给出框架音频服务的“使用视角”说明：如何初始化、启动、播放提示音/播放 WAV、以及与 sleep 的交互约定。编解码与算法细节不在本文展开。

## 代码入口

- API： [audio_service.h](file:///c:/F1InkDashboard/main/audio/audio_service.h) / [audio_service.cc](file:///c:/F1InkDashboard/main/audio/audio_service.cc)
- Codec 抽象： [audio_codec.h](file:///c:/F1InkDashboard/main/audio/audio_codec.h)
- Application 持有并启动： [application.cc](file:///c:/F1InkDashboard/main/application.cc)

## 初始化与启动

`Application::Initialize()` 中会：

1. 从 `Board` 获取 `AudioCodec*`
2. `audio_service_.Initialize(codec)`
3. `audio_service_.Start()`

业务侧通常不直接 new `AudioService`，而是通过：

- `Application::GetInstance().GetAudioService()`

## 播放能力（常用）

- 播放内置提示音：
  - `AudioService::PlaySound(sound)`
  - `AudioService::PlaySound(sound, duration_ms)`
- 播放 WAV（二进制）：
  - `AudioService::PlayWav(wav_bytes)`
- 静音/恢复：
  - `MuteOutput()` / `UnmuteOutput()`

## 双向数据流（ASCII，来自头文件注释）

```
1) (MIC) -> [Processors] -> {Encode Queue} -> [Opus Encoder] -> {Send Queue} -> (Server)
2) (Server) -> {Decode Queue} -> [Opus Decoder] -> {Playback Queue} -> (Speaker)
```

## 与 SleepManager 的约定

原则：

- 播放/录音/编解码期间不应进入 light sleep。

框架实现中会在关键阶段投票 busy（见 [sleep_manager.h](file:///c:/F1InkDashboard/main/common/sleep_manager.h)），业务新增音频场景时也应遵循同样规则：

- “开始长音频任务”前 `sm_set_busy(Audio,true)`
- “结束任务”后 `sm_set_busy(Audio,false)`

