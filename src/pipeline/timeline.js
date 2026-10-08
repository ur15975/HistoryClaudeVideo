// 根据配音时长排出整集时间线：场景起止、每句台词起止、音乐段落
const DEFAULTS = {
  lead: 0.9, // 场景开始到第一句台词
  tail: 1.1, // 最后一句台词到场景结束
  gap: 0.45, // 同一说话人两句之间
  speakerGap: 0.7, // 换人说话时
  transition: { type: 'fade', duration: 0.8 },
};

export function buildTimeline(episode, voiceMap, { fps = 24, width = 1920, height = 1080 } = {}) {
  let cursor = 0;
  const scenes = [];
  for (const [si, scene] of episode.scenes.entries()) {
    const transition = si === 0
      ? { type: 'cut', duration: 0, ...(scene.transition || {}) }
      : { ...DEFAULTS.transition, ...(typeof scene.transition === 'string' ? { type: scene.transition } : scene.transition || {}) };
    if (transition.type === 'cut') transition.duration = 0;
    const start = cursor;
    let t = start + (scene.lead ?? Math.max(DEFAULTS.lead, transition.duration * 0.7));
    let prevSpeaker = null;
    const lines = (scene.lines || []).map((line, i) => {
      const id = `${scene.id}#${i}`;
      const voice = voiceMap.get(id);
      if (!voice) throw new Error(`缺少台词配音 ${id}`);
      if (i > 0) t += line.gap ?? (line.speaker === prevSpeaker ? DEFAULTS.gap : DEFAULTS.speakerGap);
      t += line.delay || 0;
      const out = {
        ...line,
        id,
        start: round(t),
        end: round(t + voice.duration),
        duration: round(voice.duration),
        audio: voice.file,
        envelope: voice.envelope,
      };
      t += voice.duration;
      prevSpeaker = line.speaker;
      return out;
    });
    const end = Math.max(t + (scene.tail ?? DEFAULTS.tail), start + (scene.duration || 0));
    scenes.push({ ...scene, index: si, transition, start: round(start), end: round(end), lines });
    cursor = end;
  }
  const duration = round(cursor);

  // 音乐段落：from/to 指定场景 id，缺省覆盖到下一个段落开始
  const cueDefs = episode.music?.cues || [];
  const sceneIndex = (id) => {
    const i = scenes.findIndex((s) => s.id === id);
    if (i < 0) throw new Error(`音乐段落引用了不存在的场景 ${id}`);
    return i;
  };
  const cues = cueDefs.map((cue, ci) => {
    const a = sceneIndex(cue.from);
    const next = cueDefs[ci + 1];
    const b = cue.to ? sceneIndex(cue.to) : next ? sceneIndex(next.from) - 1 : scenes.length - 1;
    const start = scenes[a].start + (cue.offset || 0);
    const end = scenes[b].end;
    return { ...cue, start: round(start), end: round(end), duration: round(end - start) };
  });

  return {
    version: 1,
    fps,
    width,
    height,
    duration,
    frames: Math.ceil(duration * fps),
    episode: {
      id: episode.id,
      title: episode.title,
      subtitle: episode.subtitle,
      cast: episode.cast,
      characters: episode.characters || {},
      palette: episode.palette || {},
      components: episode.components || null,
      subtitles: episode.subtitles ?? true,
    },
    scenes,
    cues,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

// SRT 字幕
export function toSrt(timeline) {
  const fmt = (s) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const r = ms % 1000;
    const p = (x, n = 2) => String(x).padStart(n, '0');
    return `${p(h)}:${p(m)}:${p(sec)},${p(r, 3)}`;
  };
  const cast = timeline.episode.cast || {};
  let n = 0;
  const out = [];
  for (const scene of timeline.scenes) {
    for (const line of scene.lines) {
      const who = line.speaker !== 'narrator' && cast[line.speaker]?.name ? `${cast[line.speaker].name}：` : '';
      out.push(`${++n}\n${fmt(line.start)} --> ${fmt(line.end + 0.2)}\n${who}${line.text}\n`);
    }
  }
  return out.join('\n');
}
