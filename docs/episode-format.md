# 剧本格式（episode.json）

一集 = 一个 `episodes/<id>/episode.json`。画面完全由这份 JSON 描述：场景 → 图层 → 组件参数。引擎按时间逐帧绘制 SVG，所以**所有动画都是时间的函数**，同一时刻永远渲染出同一帧。

完整示例：[`episodes/zhang-qian/episode.json`](../episodes/zhang-qian/episode.json)

## 顶层字段

| 字段 | 说明 |
|---|---|
| `id` `title` `subtitle` | 剧集标识、片名、副标题 |
| `sources` | 参考史料（字符串数组），只做记录 |
| `cast` | 说话人 → `{ name, voice, style, color, direct, speed }`。`narrator` 必须有。`voice` 是 Gemini 音色名（`node src/cli.js voices` 查看）；`style` 是语气设定（默认不送进 TTS，见风格指南）；`direct: true` 时以英文导演备注的形式送进 TTS；`speed` 语速倍率；`color` 是字幕名牌颜色 |
| `characters` | 角色外观 → `{ preset, ...外观参数 }`，见“角色” |
| `pronunciations` | 额外的读音替换表 `{ "原词": "同音字" }`，只影响配音 |
| `music` | `{ provider, style, cues }`，见“配乐” |
| `mix` | `{ musicVolume: 0.35, duckDepth: 0.58 }` 混音参数 |
| `components` | 可选，本集自定义组件的 JS 文件（相对剧本目录），见“自定义组件” |
| `subtitles` | `false` 关闭整集字幕 |
| `scenes` | 场景数组 |

## 场景

```json
{
  "id": "s03",
  "caption": "长安 · 未央宫",
  "transition": { "type": "scroll", "duration": 1.3 },
  "camera": { "from": { "x": 960, "y": 540, "zoom": 1 }, "to": { "x": 960, "y": 420, "zoom": 1.3 } },
  "ambience": "fire",
  "layers": [ ... ],
  "lines": [ ... ]
}
```

| 字段 | 说明 |
|---|---|
| `id` | 唯一 id |
| `layers` | 图层数组，**先写的在下面** |
| `lines` | 台词数组；场景时长 = `lead` + 台词时长 + 间隔 + `tail` |
| `lead` / `tail` | 第一句之前 / 最后一句之后的留白秒数（默认 0.9 / 1.1） |
| `duration` | 最短时长（没有台词的标题卡用它） |
| `transition` | 进入本场景的转场：`cut` `fade` `ink`（墨晕）`scroll`（手卷从右向左展开）`wipe` `wipe-right` `iris` `dip`（纸色浸染）`dip-black` `flash` `blur`；`duration` 秒 |
| `camera` | 两种写法：`{ from, to, start, end, ease }`，或关键帧数组 `[{ at, x, y, zoom, rotate, ease }]`。`x,y` 是镜头对准的画面坐标（1920×1080），`zoom` ≥ 1 |
| `cameraShake` | 手持晃动幅度（像素），如 `3` |
| `caption` | 左上角竖排地点/时间牌，用 `·` 分隔两列 |
| `ambience` | 环境音：`wind` `fire` `night` `sand`（可为数组） |
| `subtitles` | `false` 关闭本场景字幕 |
| `fadeOut` | 场景最后 N 秒淡出到黑（片尾用） |

### 时间表达式

所有 `at` / `start` / `until` 都接受：

- 数字：场景内秒数，如 `2.5`
- `"line:2"`：第 3 句台词开始时；`"line:2:end"`：结束时
- `"end"`：场景结束；`"start"`
- 可以加减：`"line:1+0.5"`、`"end-2"`

## 台词

```json
{ "speaker": "wudi", "text": "谁愿替朕走这一趟？", "expression": "determined", "reactions": { "zhangqian": "surprised" } }
```

| 字段 | 说明 |
|---|---|
| `speaker` | `cast` 中的 id |
| `text` | 字幕与配音文字 |
| `say` | 可选，仅用于配音的改写（纠正读音） |
| `tone` | 可选，本句额外语气，如“压低声音”（仅在 `direct` 开启时送进 TTS） |
| `direct` | 本句单独开启导演备注 |
| `expression` | 说这句时说话人的表情 |
| `reactions` | 这句期间其他角色的表情 `{ 角色id: 表情 }` |
| `gap` / `delay` | 与上一句的间隔 / 额外延迟（秒） |
| `take` | 想重新生成这一句配音时改成 2、3… |

说话人如果在画面中（`character` 图层的 `character` 与 `speaker` 相同），会自动对口型。

## 图层通用字段

| 字段 | 说明 |
|---|---|
| `type` | 组件名（见下） |
| `params` | 组件参数 |
| `x` `y` `scale` `rotate` `opacity` | 图层变换 |
| `flip` | 水平镜像（**汉人角色不要用**，会变成左衽） |
| `depth` | 视差系数：0 不随镜头动，1 完全跟随。背景默认 0.6，文字默认 0，其余 1 |
| `enter` / `exit` | `{ type, at, duration, distance }`，type：`fade` `rise` `sink` `slide-left` `slide-right` `pop` `zoom` |
| `moves` | 位移关键帧 `[{ at, duration 或 until, x, y, scale, rotate, opacity, ease }]` |
| `show` | `[开始, 结束]` 只在这段时间可见 |
| `blend` | CSS 混合模式，如 `screen` |

缓动 `ease`：`linear` `inSine` `outSine` `inOutSine` `inQuad` `outQuad` `inOutQuad` `outCubic` `inOutCubic` `outBack` `outExpo`。

## 组件

### 背景 `bg.*`

| 组件 | 参数 |
|---|---|
| `bg.nightsky` 星空天幕 | `horizon`（`steppe` 带穹庐 / `plain` / `none`）`horizonY` `yurts:[[x,缩放,亮灯]]` `moon:{x,y,r}` `shootingStar`（时间）`dipper` `dipperX/Y` `chart`（星图同心圆）`milkyway` `milkyX/Y/Angle` `stars` |
| `bg.steppe` 草原 | `time`（`day` `dusk` `dawn` `night`）`yurts:[[x,y,缩放,亮灯]]` `horses:[[x,y,缩放,朝向±1]]` `clouds` `horizonY` `smoke` `grass` |
| `bg.palace` 汉宫大殿（对称） | `dais`（御座台阶）`lamps:[x,…]` `incense` `lightBeams` `wall` |
| `bg.yurt_interior` 穹庐内部 | `tapestries:[[x,宽]]` `fireX` `daylight` `felt` |
| `bg.desert` 沙漠 | `time` `moon` `sunX/Y` `horizonY` |
| `bg.mountains` 青绿雪山 | `time` `snow` |
| `bg.river_land` 河谷沃野 | `time` |
| `bg.citygate` 汉代城门 | `time` |
| `bg.pattern` 平涂纹样 | `color` `motif`（`cloud` `diamond` `wave` `star`）`motifColor` `step` `drift` |
| `bg.paper` 纸面 | `color` `wash` `border` `borderColor` |
| `bg.inkwash` 水墨远山 | `sun` `sunX/Y` |
| `bg.solid` | `color` |

背景都画出了 260px 的出血，镜头 `zoom` 在 1～1.6 之间平移都不会露边。

### 角色 `character`

```json
{ "type": "character", "x": 960, "y": 1110, "scale": 1.5,
  "params": { "character": "zhangqian", "pose": "gongshou", "look": [0.5, 0], "expression": "determined" } }
```

图层原点在**胸像底部中心**：头顶约在 `y - 560×scale`。半身特写常用 `y: 1100, scale: 1.4~1.6`；中景 `scale: 0.8~1`。`full: true` 画全身（脚在 `y + 900×scale`）。

外观参数（写在 `characters` 里，或在图层 `params` 里临时覆盖）：

| 参数 | 取值 |
|---|---|
| `preset` | `han_official` `emperor` `han_soldier` `han_woman` `xiongnu_man` `xiongnu_chief` `xiongnu_woman` |
| `hairStyle` | `topknot` `bun` `braids` `braids_long` `loose` |
| `headwear` | `guan`（进贤冠）`mian`（冕旒）`ze`（赤帻）`fur`（毡帽）`eagle`（鹰顶金冠）`beads`（串珠额饰）`none` |
| `eyes` | `round` `gentle` `sharp` `narrow` |
| `robe` | `han`（右衽）`nomad`（左衽，毛皮领）`armor`（札甲） |
| 颜色 | `skin` `hair` `robeColor` `collarColor` `innerColor` `beltColor` `hatColor` `furColor` |
| `beard` | `none` `mustache` `goatee` `full` |
| `pose` | `rest` `gongshou`（拱手）`hold`（手持竖杆，配合 `prop.jie`） |
| `expression` | `neutral` `smile` `happy` `serious` `determined` `angry` `sad` `worried` `surprised` `closed` `grim` `tired` |
| `look` | 视线 `[x, y]`，-1～1 |
| 其他 | `full` `tilt`（歪头角度）`turn`（-1～1 微侧脸）`blush` `emblems`（帝服日月）`goldBelt` |

远景小人：`figure`（`kind`: `han` `kneel` `nomad` `soldier`，`color`）；一排人：`crowd`（`kind` `count` `spacing` `rows` `rowGap` `rowShift` `size` `colors`）。

### 道具 `prop.*`

| 组件 | 参数 |
|---|---|
| `prop.jie` 汉节 | `length` `color` `worn`（0～1 旄毛磨损）`wind` `lean` |
| `prop.fire` 篝火 | — |
| `prop.horse` 马 | `gait`（`stand` `walk` `gallop`）`speed` `color` `saddle` |
| `prop.rider` 骑手 | `kind`（`han` `nomad`）`jie`（是否持节）`gait` `speed` `color` `horseColor` |
| `prop.caravan` 队伍 | `kind`（`horse` `camel`）`count` `spacing` `gait` `colors` `riders` |
| `prop.camel` 骆驼 | `color` `load` |
| `prop.banner` 旗 | `text` `color` `height` |
| `prop.slips` 竹简 | `lines`（每片一列字）`count` `unroll`（展开时间） |
| `prop.table` 漆案 | `width` `slips` |

马默认朝右（东）；向西走用 `flip: true`。

### 地图 `map.ancient`

古舆图风格：山形符号、双线河流、竖排地名、朱砂路线。内置预设 `western_regions`（西汉与西域），地点 id：`changan` `longxi` `wuwei` `dunhuang` `yumen` `loulan` `qiuci` `shule` `yutian` `dayuan` `kangju` `yuezhi` `daxia` `xiongnu` `qiang` `pamir`。

| 参数 | 说明 |
|---|---|
| `show` | 只显示这些地点 |
| `places` | 新增/覆盖地点 `{ id: { name, x, y, kind } }`，kind：`capital` `city` `pass` `state` `court` `region` `mountain` |
| `regions` | 大字区域名 `[{ name, x, y, size, color }]` |
| `routes` | `[{ points: [地点id 或 [x,y]], start, duration, color, width, dashed, icon }]`，路线随时间描出，`icon` 是行进标记上的字 |
| `markers` | 事件印记 `[{ place, text, at, dx, dy }]`，如“俘” |

其他朝代可以用 `places` 自建地点（坐标系同 1920×1080，西左东右）。

### 文字 `text.*`

| 组件 | 参数 |
|---|---|
| `text.title` 书法标题 | `text` `sub` `seal`（印章文字）`at` `size` `x` `y` `vertical` `brushColor` |
| `text.quote` 竖排引文 | `text`（`\n` 分列）`source` `size` `color` `at` `perChar` `font`（`brush` / `kai`） |
| `text.seal` 印章 | `text` `size` `at` |
| `text.label` 标签 | `text` `size` `color` `font` `outline` |

### 特效 `fx.*`

`fx.snow`（`count` `wind` `speed`）、`fx.sand`（`color` `haze`）、`fx.petals`、`fx.embers`、`fx.fog`（`y` `opacity`）、`fx.rays`（`x` `y`）、`fx.glow`（`cx` `cy` `r` `color` `flicker`）、`fx.tint`（`color` `opacity` `blend`）、`fx.speedlines`、`fx.letterbox`。

### 原始 SVG `svg.raw`

```json
{ "type": "svg.raw", "params": { "markup": "<circle cx='960' cy='540' r='80' fill='#c2452d'/>" } }
```

一次性的特殊画面可以直接写 SVG。

## 配乐

```json
"music": {
  "provider": "lyria",
  "style": "所有段落共用的风格描述（英文）",
  "cues": [
    { "id": "opening", "from": "s01", "to": "s02", "prompt": "该段的乐器、情绪、速度", "mood": "wonder" }
  ]
}
```

- `provider`：`lyria`（默认，Gemini Lyria 3 生成）/ `synth`（本地程序合成）/ `none`
- 每段时长自动等于 `from`～`to` 场景的总长；段与段之间自动交叉淡化
- `file`：用本地曲目代替生成（放在 `assets/music/`）
- `mood`：本地合成兜底时使用：`calm` `sad` `tense` `epic` `wonder`
- `volume`：该段相对音量

## 自定义组件

在剧本里写 `"components": "components.js"`，然后在 `episodes/<id>/components.js` 里注册：

```js
import { register } from '/engine/lib/registry.js';
import { svg, group, PALETTE as P, onTwos } from '/engine/lib/core.js';

register('custom.skullcup', (params, ctx) => {
  const g = group([svg('path', { d: '…', fill: P.gold })]);
  return {
    el: g,
    update(t) { g.setAttribute('opacity', String(Math.min(1, t / 0.8))); },
  };
});
```

`ctx` 提供：`defs`（放渐变/裁剪）、`timeOf(时间表达式)`、`rng(seed)`（可复现随机数）、`mouth(角色id, t)`、`lineAt(t)`、`duration`。`update(t)` 的 `t` 是场景内秒数，必须是纯函数（不能依赖上一帧的状态）。

## 多语言版本

同一集的其他语言版本不复制剧本，而是在剧本旁边放一个**语言覆盖层** `episode.<lang>.json`，只写需要换语言的部分；画面、镜头、动作全部沿用原剧本。以后改画面，各语言版本一起生效。

```bash
npm run still -- zhang-qian --lang en --no-tts --rebuild   # 检查英文画面文字
npm run build -- zhang-qian --lang en                      # 出片 → build/zhang-qian-en/zhang-qian-en.mp4
node src/cli.js translate <剧集> --lang en                 # 用 Claude API 自动写覆盖层（需要 ANTHROPIC_API_KEY）
```

```json
{
  "lang": "en",
  "title": "Chiseling Through",
  "subtitle": "Zhang Qian and the Road West",
  "cast": { "narrator": { "name": "Narrator" }, "wudi": { "name": "Emperor Wu" } },
  "pronunciations": { "Zhang Qian": "Jahng Chyen" },
  "scenes": {
    "s03": {
      "caption": "Chang'an · Weiyang Palace",
      "lines": [ { "text": "…" }, { "text": "…" }, { "text": "…" } ]
    },
    "s02": { "layers": { "1": { "params": { "sub": "Zhang Qian and the Road West", "sub2": "…" } } } }
  }
}
```

| 字段 | 说明 |
|---|---|
| `lang` | 语言代码。`zh`/`ja` 以外的语言按西文排版（横排地点牌、EB Garamond 字幕、Cinzel 标题） |
| `title` `subtitle` `description` | 替换原剧本的同名字段 |
| `cast` | 与原 `cast` 深合并，通常只改 `name`（字幕名牌），也可以换 `voice` |
| `pronunciations` | 本语言的 TTS 读音改写表（不继承中文读音表），西文按整词替换，例如把拼音人名改写成英语读者更容易读准的拼法 |
| `scenes.<id>.lines` | **句数和顺序必须与原场景一致**（镜头关键帧按句子下标对齐）。每句可写 `text`、`say`、`subtitle`；原剧本里与语言绑定的 `say`/`take`/`tone`/`subtitle` 会被丢弃 |
| `scenes.<id>.caption` | 地点牌，用 ` · ` 分成两行 |
| `scenes.<id>.layers` | 按图层下标（或图层 `id`）深合并，用来换画面文字：`text.title` 的 `sub`/`sub2`，`text.quote` 的 `translation`/`translationSource`，地图 `markers` 的 `label` 等 |
| `music` `tts` | 可选，覆盖配乐或配音设置 |

引擎会自动处理：地图内置地名有英文名（`en` 字段）、指北针显示 N、区域名改为大写碑刻体；书法标题、印章、竖排引文作为视觉元素保留，英文版在下方配译文。有台词却没写翻译的场景会报错，避免漏翻。
