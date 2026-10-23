/**
 * Mock OpenAI-compatible gateway for tests and local demos.
 *   POST {base}/chat/completions  — streams scripted turns (content + fragmented tool_calls) as SSE
 *   POST {base}/audio/transcriptions — returns a fixed Persian transcript
 *
 * CLI: `npx tsx apps/server/scripts/mock-llm.ts [port]` serves a small demo script
 * (search → suggest_replies → short Persian answer) so the real server can run in LLM mode:
 *   LLM_BASE_URL=http://localhost:4010/v1 LLM_API_KEY=x npm run dev
 */
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';

export interface MockTurn {
  /** Assistant text, streamed in small chunks. */
  content?: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
  /** Return this HTTP status instead of streaming. */
  status?: number;
  /** Delay before responding (ms) — for timeout tests. */
  delayMs?: number;
  /** Respond with a non-streaming JSON completion. */
  json?: boolean;
}

export interface MockLlm {
  url: string;
  port: number;
  /** Request bodies received on /chat/completions. */
  requests: any[];
  /** Remaining scripted turns (mutable). */
  script: MockTurn[];
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function chunks(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

/** Start a mock server; `fallback` is used when the script runs out. */
export function startMockLlm(script: MockTurn[] = [], opts: { port?: number; fallback?: MockTurn } = {}): Promise<MockLlm> {
  const state: MockLlm = { url: '', port: 0, requests: [], script, close: async () => {} };
  const server: Server = createServer(async (req, res) => {
    const body = await readBody(req);
    if (req.url?.endsWith('/audio/transcriptions')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ text: 'گوشی سامسونگ A07 قسطی' }));
      return;
    }
    if (!req.url?.endsWith('/chat/completions') || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    if (req.headers.authorization !== 'Bearer test-key' && req.headers.authorization !== 'Bearer x') {
      res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}');
      return;
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      /* ignore */
    }
    state.requests.push(parsed);
    const turn = state.script.shift() ?? opts.fallback ?? { content: 'باشه.' };
    if (turn.delayMs) await new Promise((r) => setTimeout(r, turn.delayMs));
    if (turn.status && turn.status !== 200) {
      res.writeHead(turn.status, { 'content-type': 'application/json' }).end('{"error":{"message":"mock failure"}}');
      return;
    }
    const toolCalls = (turn.toolCalls ?? []).map((t, i) => ({ id: `call_${state.requests.length}_${i}`, name: t.name, args: JSON.stringify(t.args) }));
    if (turn.json || parsed.stream === false) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: turn.content ?? null,
                tool_calls: toolCalls.length ? toolCalls.map((t) => ({ id: t.id, type: 'function', function: { name: t.name, arguments: t.args } })) : undefined,
              },
              finish_reason: toolCalls.length ? 'tool_calls' : 'stop',
            },
          ],
        }),
      );
      return;
    }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    const base = { id: 'mock', object: 'chat.completion.chunk', model: parsed.model };
    send({ ...base, choices: [{ index: 0, delta: { role: 'assistant' } }] });
    for (const c of chunks(turn.content ?? '', 7)) send({ ...base, choices: [{ index: 0, delta: { content: c } }] });
    toolCalls.forEach((t, i) => {
      // First fragment carries id + name; arguments arrive in several pieces (like real gateways).
      send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: t.id, type: 'function', function: { name: t.name, arguments: '' } }] } }] });
      for (const a of chunks(t.args, 5)) send({ ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: i, function: { arguments: a } }] } }] });
    });
    send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: toolCalls.length ? 'tool_calls' : 'stop' }] });
    res.write('data: [DONE]\n\n');
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(opts.port ?? 0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      state.port = port;
      state.url = `http://127.0.0.1:${port}/v1`;
      state.close = () => new Promise<void>((r) => server.close(() => r()));
      resolve(state);
    });
  });
}

// CLI demo
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.argv[2] ?? 4010);
  const demo = (): MockTurn[] => [
    {
      toolCalls: [
        { name: 'suggest_replies', args: { options: [{ label: 'فروشنده‌های گزینهٔ ۱', message: 'فروشنده‌های گزینه ۱ کجا هستند؟' }, { label: 'فقط قسطی‌ها', message: 'فقط قسطی' }] } },
      ],
    },
    { content: 'چند مدل مناسب پیدا کردم؛ کارت‌ها را ببینید. قیمت‌ها ثبت‌شده‌اند و موجودی را می‌توانم از فروشگاه‌ها بپرسم.' },
  ];
  const m = await startMockLlm(demo(), { port, fallback: { content: 'در خدمتم؛ بفرمایید.' } });
  // Refill the demo script forever.
  setInterval(() => {
    if (m.script.length === 0) m.script.push(...demo());
  }, 200);
  console.log(`mock LLM listening on ${m.url}`);
}
