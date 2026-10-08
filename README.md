# 天幕 · 中国历史动画生成器

用 **Claude 绘制动画**、**Gemini 配音与配乐**，自动生成《天幕的魔女》（天幕のジャードゥーガル）风格的中国历史动画视频。

- 🎨 **画面**：Claude 用代码“画”出每一帧——剧本描述场景和镜头，引擎把参数化的 SVG 角色、背景、地图、书法字幕逐帧渲染成 1080p/24fps 视频。人物会眨眼、呼吸、按配音音量对口型。
- 🎙 **配音**：Gemini 3.8 TTS（`gemini-3.8-flash-tts`，配额用完自动换 `gemini-3.8-flash-lite-tts`），旁白与角色各用一种音色；**每句生成后由 `gemini-3.5-transcribe` 逐字听写校对**，读错、漏读、多读的句子自动重录。
- 🎵 **配乐**：Gemini **Lyria 3**（`lyria-3-pro-preview`）按段落生成与画面等长的民乐配乐，自动检测并剔除含人声的版本；混音时说话处自动压低音乐。
- 📜 **字幕**：画面内烧录字幕 + 导出 `.srt`。

示例剧集：[《凿空：张骞出使西域》](episodes/zhang-qian/episode.json)（约 3 分 30 秒，15 个场景，34 句台词）。

## 工作原理

```
episode.json（剧本 + 分镜，由 Claude 编写）
   │
   ├─▶ Gemini TTS ──▶ 逐句配音 ──▶ Gemini 听写校对（不合格自动重录）
   │                     │
   │                     ▼
   ├─▶ 时间线：按配音时长排出每个场景、每句台词的起止时间
   │                     │
   ├─▶ Lyria 3 ──▶ 各段配乐（时长对齐）──▶ 混音（闪避 + 环境音 + 响度标准化）
   │                     │
   └─▶ 浏览器引擎（SVG）──▶ Playwright 逐帧截图 ──▶ ffmpeg 编码 ──▶ 成片 mp4
```

画面风格的取舍写在 [`docs/style-guide.md`](docs/style-guide.md)：原作参考伊斯兰细密画的平面构图和对称建筑，我们换成汉画像砖、青绿山水、古舆图的语汇；矿物色调色板、宣纸纹理、“一拍二”的手绘顿挫感、以星空和帐幕为母题。

## 快速开始

需要 Node.js ≥ 20 和 ffmpeg。

```bash
npm install
npx playwright install chromium     # 首次使用需要下载浏览器
cp .env.example .env                # 填入 GEMINI_API_KEY
npm run build -- zhang-qian         # 出片：build/zhang-qian/zhang-qian.mp4
```

只想先看画面（不调用任何 API）：

```bash
npm run still -- zhang-qian --no-tts --rebuild   # 每个场景一张截图 → build/zhang-qian/stills/
npm run preview -- zhang-qian                    # 浏览器里拖动时间轴预览
```

## 做新的一集

**方式一：在 Claude Code 里直接说**（推荐）

> 按 CLAUDE.md 的流程，做一集《赤壁之战》，3 分钟左右。

Claude 会查史料、写剧本和分镜、先出截图自查构图，再调用 Gemini 配音配乐并出片。缺少的画面元素它会直接写成新的 SVG 组件。

**方式二：命令行调用 Claude API**

```bash
# .env 中设置 ANTHROPIC_API_KEY
npm run write -- "苏武牧羊" --id su-wu --minutes 3
npm run still -- su-wu --no-tts --rebuild
npm run build -- su-wu
```

剧本格式和全部组件参数见 [`docs/episode-format.md`](docs/episode-format.md)。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run build -- <剧集>` | 一键出片（配音 → 时间线 → 配乐 → 混音 → 渲染 → 合成） |
| `npm run still -- <剧集>` | 渲染关键帧截图；`--t 10,25.5` 指定时间，`--scene s05` 指定场景 |
| `npm run preview -- <剧集>` | 本地预览服务器（有混音时带声音） |
| `npm run tts -- <剧集>` | 只生成配音 |
| `npm run music -- <剧集>` | 只生成配乐并混音 |
| `npm run check -- <剧集>` | 输出配音校对报告 |
| `npm run write -- "<主题>"` | 用 Claude 写新剧本 |
| `node src/cli.js voices` | 列出 Gemini 音色 |

常用选项：`--no-tts`（无配音快速预览）、`--music synth|none`、`--from s05 --to s08`（只渲染一段）、`--scale 0.5`（草稿质量）、`--force-tts` / `--force-music`（忽略缓存）、`--no-verify`（跳过配音校对）。

## 关于背景音乐

推荐并默认使用 **Gemini Lyria 3**，原因：

1. **和配音同一个 Gemini API Key**，不用再接别的服务；
2. **可以指定时长**：每段配乐按对应场景的总时长生成（`lyria-3-pro-preview` 实测能准确生成 60～120 秒的曲子），不需要循环或硬剪；
3. **可以按情绪分段**：剧本里每个 `cue` 写一句英文提示（乐器、情绪、速度），例如宫廷段用编钟与古琴、逃亡段用琵琶轮指和鼓点；
4. 生成后会**自动质检**：让 Gemini 听一遍，含人声（吟唱、哼唱）的版本自动重做——旁白底下的配乐不能有人声。

另外两种方式：

- **本地曲目**：在 cue 里写 `"file": "xxx.mp3"`（放在 `assets/music/`），适合用版权清晰的曲库（如 YouTube 音频库、Pixabay Music 等，按各自许可证使用）。
- **程序合成**：`--music synth`，离线用五声音阶拨弦 + 持续低音合成，音质朴素，但不依赖任何服务。

> 使用 AI 生成的配乐和配音发布作品前，请确认 Google 生成式 AI 服务的使用条款。

## 配额与费用

Gemini 免费档对每个模型的限制（2026 年 10 月实测）：**每分钟 10 次、每天 100 次**。一集 30 多句台词约需 40 次 TTS 请求 + 40 次听写请求 + 6～10 次配乐请求，所以免费档一天大约能完整做两集。项目已内置：

- 按模型限速（`HCV_GEMINI_RPM`，付费档可调高或设为 0）；
- 429 时按服务端给出的时间等待重试；
- **当天配额用尽时自动换用后备模型**（TTS 默认 3.8 flash → 3.8 flash lite，保证整集音色一致；可用 `HCV_TTS_MODELS` 追加其他模型，如 `gemini-3.1-flash-tts-preview`）；
- 配音、配乐、校对结果都按内容哈希缓存在 `.cache/`，改一句台词只重做那一句。

## 目录

```
episodes/<id>/episode.json   剧本（可选 components.js 自定义组件）
engine/                      浏览器端动画引擎与组件库（角色、背景、道具、地图、文字、特效）
src/                         命令行、Gemini 客户端、TTS/配乐/校对、时间线、混音、渲染
docs/                        风格指南、剧本格式
build/<id>/                  输出：成片、字幕、截图、中间文件（不进版本库）
```

## 已知限制

- 角色目前是正面半身/全身像，侧身和复杂肢体动作需要写自定义组件。
- 内置地图预设只有“西汉与西域”，其他朝代需在剧本里用 `places` 自定义坐标。
- 渲染速度约每秒 13～14 帧（4 核），3 分半的成片画面渲染约 6 分钟。
