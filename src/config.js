import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 读取项目根目录下的 .env（不覆盖已存在的环境变量）
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (value && process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

export const config = {
  width: 1920,
  height: 1080,
  fps: 24,
  // 视频渲染并行度（每个 worker 一个浏览器实例）
  workers: Number(process.env.HCV_WORKERS || Math.max(2, Math.min(8, os.cpus().length))),
  sampleRate: 48000,

  gemini: {
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    baseUrl: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    // 主模型 + 后备模型（逗号分隔）。主模型当天配额用尽时依次换用后备模型
    ttsModels: (process.env.HCV_TTS_MODELS || 'gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview,gemini-2.5-flash-preview-tts,gemini-2.5-pro-preview-tts').split(',').map((s) => s.trim()),
    musicModels: (process.env.HCV_MUSIC_MODELS || 'lyria-3-pro-preview').split(',').map((s) => s.trim()),
    checkModels: (process.env.HCV_CHECK_MODELS || 'gemini-3.5-flash,gemini-3.8-flash,gemini-3-flash-preview').split(',').map((s) => s.trim()),
    ttsConcurrency: Number(process.env.HCV_TTS_CONCURRENCY || 4),
    // 每个模型每分钟最多请求数（免费档为 10；付费档可调高，设为 0 关闭限速）
    rpm: Number(process.env.HCV_GEMINI_RPM ?? 10),
  },

  claude: {
    model: process.env.HCV_CLAUDE_MODEL || 'claude-opus-5-5',
  },

  chromiumPath: process.env.CHROMIUM_PATH || '',

  dirs: {
    cache: path.join(ROOT, '.cache'),
    build: path.join(ROOT, 'build'),
    episodes: path.join(ROOT, 'episodes'),
    music: path.join(ROOT, 'assets', 'music'),
  },
};

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
