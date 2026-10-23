import { tokenLimitParam } from '../agent/llm.js';
/**
 * Optional LLM rephrase of a decided transcript (facts are already fixed).
 * Small fetch to the OpenAI-compatible gateway; any failure, timeout or fact drift → null (templates are used).
 */
import { toLatinDigits } from '@titl/shared';
import type { Config } from '../config.js';
import type { SimLine } from './simulator.js';

const digitsOf = (s: string) => (toLatinDigits(s).match(/\d+/g) ?? []).join(',');

export async function rephraseLines(config: Config, lines: SimLine[], timeoutMs = 6000): Promise<SimLine[] | null> {
  if (!config.llmEnabled || !config.LLM_BASE_URL || lines.length === 0) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, config.LLM_TIMEOUT_MS));
  try {
    const res = await fetch(`${config.LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.LLM_API_KEY}` },
      body: JSON.stringify({
        model: config.LLM_FAST_MODEL,
        temperature: 0.6,
        [tokenLimitParam(config.LLM_FAST_MODEL)]: 1200,
        messages: [
          {
            role: 'system',
            content:
              'You rewrite a short Persian phone conversation between a shopping assistant (agent) and a shop (store) so it sounds natural and colloquial-polite Tehrani Persian. ' +
              'STRICT: keep the same number of lines in the same order and speakers; keep every number, price, time, name and fact exactly; add NO new facts; use correct Persian half-spaces (ZWNJ). ' +
              'Reply with ONLY a JSON array of strings, one per input line.',
          },
          { role: 'user', content: JSON.stringify(lines.map((l) => `${l.speaker}: ${l.text}`)) },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? '';
    const m = content.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr) || arr.length !== lines.length) return null;
    const out: SimLine[] = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = arr[i];
      if (typeof raw !== 'string') return null;
      const text = raw.replace(/^(agent|store|system)\s*:\s*/i, '').trim();
      // Fact guard: the same numbers must appear in the same line.
      if (!text || digitsOf(text) !== digitsOf(lines[i]!.text)) return null;
      out.push({ speaker: lines[i]!.speaker, text });
    }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
