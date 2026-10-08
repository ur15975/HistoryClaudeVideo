// Gemini REST 客户端：TTS、Lyria 配乐、音频校对共用
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { config } from '../config.js';
import { log, sleep } from '../util/log.js';

// Node 自带 fetch 默认不读 HTTPS_PROXY，这里显式接上
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

export class GeminiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// 某模型当天的配额用尽（免费档常见为每天 100 次）
export class QuotaExhaustedError extends GeminiError {}

// 已用尽配额的模型 → 恢复时间；同一进程内不再请求它们
const exhausted = new Map();
export const isExhausted = (model) => (exhausted.get(model) || 0) > Date.now();

// 每个模型一个滑动窗口限速器（免费档常见为每分钟 10 次）
const windows = new Map();
async function throttle(model) {
  const rpm = config.gemini.rpm;
  if (!rpm) return;
  const w = windows.get(model) || [];
  windows.set(model, w);
  for (;;) {
    const now = Date.now();
    while (w.length && now - w[0] > 60_000) w.shift();
    if (w.length < rpm) {
      w.push(now);
      return;
    }
    await sleep(60_000 - (now - w[0]) + 250);
  }
}

// 从 429 响应中读出服务端建议的等待时间
function retryDelayMs(text) {
  try {
    const info = JSON.parse(text).error?.details?.find((d) => d['@type']?.endsWith('RetryInfo'));
    const sec = parseFloat(info?.retryDelay);
    if (sec > 0) return sec * 1000 + 1000;
  } catch {}
  return null;
}

export async function generateContent(model, body, { retries = 4, timeoutMs = 300_000 } = {}) {
  const url = `${config.gemini.baseUrl}/models/${model}:generateContent`;
  const headers = { 'Content-Type': 'application/json' };
  if (config.gemini.apiKey) headers['x-goog-api-key'] = config.gemini.apiKey;
  let limited = 0;

  for (let attempt = 0; ; attempt++) {
    await throttle(model);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (attempt >= retries) throw err;
      log.warn(`${model} 网络错误（${err.message}），重试 ${attempt + 1}/${retries}`);
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    const text = await res.text();
    if (res.ok) {
      const json = JSON.parse(text);
      const cand = json.candidates?.[0];
      if (!cand?.content?.parts?.length) {
        const reason = cand?.finishReason || json.promptFeedback?.blockReason || '无内容';
        // 偶发的空结果可以重试
        if (attempt < retries) {
          log.warn(`${model} 返回空结果（${reason}），重试 ${attempt + 1}/${retries}`);
          await sleep(1500 * 2 ** attempt);
          continue;
        }
        throw new GeminiError(`${model} 未返回内容：${reason}`, res.status, json);
      }
      return json;
    }
    // 按天的配额用尽：等待没有意义，直接报错让调用方换模型
    if (res.status === 429) {
      const wait = retryDelayMs(text) ?? 0;
      if (/PerDay/.test(text) || wait > 10 * 60_000 || /limit: 0\b/.test(text)) {
        exhausted.set(model, Date.now() + Math.max(wait, 60 * 60_000));
        throw new QuotaExhaustedError(`${model} 今日配额已用尽（约 ${(wait / 3600_000).toFixed(1)} 小时后恢复）`, 429, text);
      }
    }
    // 限流单独计数：按服务端建议的时间等待后重试
    if (res.status === 429 && limited < 10) {
      limited++;
      attempt--;
      const wait = retryDelayMs(text) ?? 15_000;
      log.warn(`${model} 触发限流，${(wait / 1000).toFixed(0)}s 后重试（${limited}/10）`);
      await sleep(wait);
      continue;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new GeminiError(`${model} 请求失败 HTTP ${res.status}: ${text.slice(0, 500)}`, res.status, text);
    }
    log.warn(`${model} HTTP ${res.status}，重试 ${attempt + 1}/${retries}`);
    await sleep(3000 * 2 ** attempt);
  }
}

// 取出第一段内联音频
export function firstInlineData(json) {
  for (const part of json.candidates[0].content.parts) {
    if (part.inlineData?.data) return part.inlineData;
  }
  return null;
}

export function firstText(json) {
  return json.candidates[0].content.parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
}

// 依次尝试多个模型：前一个当天配额用尽时自动换下一个
export async function generateWithFallback(models, body, opts) {
  let lastErr;
  for (const model of models) {
    if (!model || isExhausted(model)) continue;
    try {
      return { json: await generateContent(model, body, opts), model };
    } catch (err) {
      // 配额用尽或模型已下线（404）都换下一个
      const gone = err instanceof GeminiError && err.status === 404;
      if (!(err instanceof QuotaExhaustedError) && !gone) throw err;
      if (gone) exhausted.set(model, Date.now() + 24 * 3600_000);
      log.warn(`${gone ? `${model} 不可用` : err.message}，改用下一个模型`);
      lastErr = err;
    }
  }
  throw lastErr || new GeminiError(`没有可用的模型（${models.join(', ')}）`, 429, '');
}
