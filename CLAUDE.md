# CLAUDE.md

本仓库用代码“画”动画：Claude 写剧本和分镜（JSON + SVG 组件），浏览器逐帧渲染，Gemini 负责配音（TTS）和配乐（Lyria），ffmpeg 合成成片。画风模仿《天幕的魔女》，题材是中国历史。

## 做一集新视频的流程

1. **先读** `docs/style-guide.md`（画风、叙事、声音规范）和 `docs/episode-format.md`（JSON 格式与全部组件参数）。参考 `episodes/zhang-qian/episode.json`。
2. **查史料**：确认年代、人物、地名、官职、服饰。台词里引用原文要准确。
3. **写剧本** `episodes/<id>/episode.json`：8～16 个场景，旁白为主；给每个角色设计外观（`characters`）和音色（`cast`）；`music.cues` 覆盖所有场景。
4. **先看画面再配音**：`npm run still -- <id> --no-tts --rebuild` 每个场景出一张图到 `build/<id>/stills/`，用 Read 工具逐张检查构图、遮挡、文字溢出、穿帮（例如汉人角色被 `flip` 成左衽）。需要看某个场景的多个时刻：`--scene s05`；指定时间：`--t 12.5,30`。
5. **出片**：`npm run build -- <id>`。配音会逐句自动校对（`gemini-3.5-transcribe` 听写比对），不合格自动重录。只重渲染一部分：`--from s05 --to s07`。
   - 不要把中文语气提示和台词拼在一起送 TTS（Gemini 3.8 会念出来）；角色气质靠 `voice` 选择，必要时用 `direct: true`。
   - 校对必须用专用听写模型：通用对话模型会自动省略“用……的语气说”这类话，造成漏判。
6. 有读错的句子：给台词加 `say`（同音字改写）或把 `take` 加 1，再 build；查看汇总：`npm run check -- <id>`。

现有组件画不出来的东西，在 `episodes/<id>/components.js` 里写自定义组件（见 `docs/episode-format.md` 末尾），或在剧本里用 `svg.raw` 直接写 SVG。通用的新组件加到 `engine/lib/` 对应文件并补文档。

## 代码结构

- `src/cli.js` — 命令入口（build / still / tts / music / preview / check / write）
- `src/gemini/` — Gemini 客户端（限速、429 重试）、TTS、配音校对、Lyria 配乐、读音表
- `src/pipeline/` — 时间线、混音（闪避）、程序化音乐/环境音、静态服务器、Playwright 渲染
- `src/claude/writer.js` — 用 Claude API 由主题生成剧本（需要 `ANTHROPIC_API_KEY`）
- `engine/` — 浏览器端引擎：`engine.js`（场景、镜头、转场、字幕）、`lib/*.js`（组件库）

## 约定

- 引擎里的动画必须是时间的纯函数（`update(t)` 不依赖上一帧），随机数一律用 `ctx.rng(seed)`，否则并行渲染会出现跳帧。
- 角色和道具的动作用 `onTwos(t)` 量化到 12fps，镜头运动保持 24fps 平滑。
- 颜色用 `PALETTE`（`engine/lib/core.js`）里的矿物色，不要用高饱和纯色。
- 汉人服装右衽、游牧左衽；地图西左东右。
- 代码注释和文档用中文。
- `build/` 和 `.cache/` 不进版本库。配音和配乐按内容哈希缓存在 `.cache/`，改一句台词只会重新生成那一句。

## 环境

- Node ≥ 20、ffmpeg、Playwright Chromium（`npx playwright install chromium`）
- `GEMINI_API_KEY`（配音 + 配乐）；`ANTHROPIC_API_KEY`（可选，`npm run write` 用）
- 免费档 Gemini 每个模型每分钟 10 次请求，客户端已限速（`HCV_GEMINI_RPM` 可调）
