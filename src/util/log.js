const t0 = Date.now();

function stamp() {
  const s = ((Date.now() - t0) / 1000).toFixed(1).padStart(6);
  return `\x1b[2m[${s}s]\x1b[0m`;
}

export const log = {
  info: (...a) => console.log(stamp(), ...a),
  step: (msg) => console.log(stamp(), `\x1b[36m▶ ${msg}\x1b[0m`),
  ok: (msg) => console.log(stamp(), `\x1b[32m✔ ${msg}\x1b[0m`),
  warn: (...a) => console.warn(stamp(), '\x1b[33m⚠\x1b[0m', ...a),
  error: (...a) => console.error(stamp(), '\x1b[31m✖\x1b[0m', ...a),
};

// 以固定并发执行异步任务
export async function pool(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
