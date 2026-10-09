// Claude API 调用：流式生成一段 JSON，校验失败时把错误发回去让 Claude 修正（最多 3 轮）
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { log } from '../util/log.js';

export function extractJson(text) {
  const m = /```json\s*([\s\S]*?)```/.exec(text) || /```\s*([\s\S]*?)```/.exec(text);
  const raw = (m ? m[1] : text).trim();
  return JSON.parse(raw);
}

/**
 * system：系统提示（数组，可带 cache_control）；ask：用户请求；
 * accept(json)：校验并落盘，返回结果；抛错则把错误信息发回给 Claude 修正。
 */
export async function askClaudeForJson({ system, ask, accept, what = 'JSON', rounds = 3 }) {
  const client = new Anthropic();
  const messages = [{ role: 'user', content: ask }];
  for (let round = 1; round <= rounds; round++) {
    let chars = 0;
    const stream = client.beta.messages.stream({
      model: config.claude.model,
      max_tokens: 64000,
      // 被安全分类器拒绝时，服务端自动换用推荐的后备模型重试
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high' },
      system,
      messages,
    });
    stream.on('text', (delta) => {
      chars += delta.length;
      if (chars % 2000 < delta.length) process.stdout.write('.');
    });
    let msg;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      // 401，或本机根本没有配置任何凭证（SDK 在发请求前就报错）
      if (err instanceof Anthropic.AuthenticationError || /authentication method/i.test(err.message)) {
        throw new Error('Claude API 认证失败：请在 .env 中设置 ANTHROPIC_API_KEY。也可以直接在 Claude Code 里让 Claude 按 docs/ 完成。');
      }
      throw err;
    }
    process.stdout.write('\n');
    if (msg.stop_reason === 'refusal') throw new Error(`Claude 拒绝了这个请求：${msg.stop_details?.explanation || '未说明原因'}`);
    if (msg.stop_reason === 'max_tokens') log.warn(`输出达到长度上限，${what}可能被截断`);

    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    let problem;
    try {
      return await accept(extractJson(text));
    } catch (err) {
      problem = err.message;
    }
    log.warn(`第 ${round} 稿未通过校验：${problem.split('\n')[0]}`);
    // 原样带回上一轮回复（含思考块），再要求修正
    messages.push({ role: 'assistant', content: msg.content });
    messages.push({ role: 'user', content: `${what}没有通过校验：\n${problem}\n请修正后重新输出完整的 ${what}。` });
  }
  throw new Error(`Claude ${rounds} 次生成的${what}都没有通过校验`);
}
