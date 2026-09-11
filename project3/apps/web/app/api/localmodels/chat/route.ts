import { NextRequest } from 'next/server';
import { streamLocalModel, runLocalModel } from '@/lib/localmodels/registry';

export const dynamic = 'force-dynamic';

/**
 * Streaming chat with Aetherion's own on-device models.
 * Accepts the same message envelope as /api/chat (Aetheris core) so the
 * bridge can point at either backend unchanged:
 *   { model: 'aetherion-math', messages: [{ role: 'user', content: '…' }] }
 * Emits an SSE delta stream, then a done frame.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    model?: string;
    messages?: Array<{ role?: string; content?: string }>;
    stream?: boolean;
  } | null;
  const prompt = (body?.messages ?? []).filter((m) => m.role === 'user').map((m) => m.content ?? '').join('\n').trim();
  if (!prompt) {
    return Response.json({ error: 'messages[].content is required' }, { status: 400 });
  }
  const model = body?.model ?? 'aetherion-local';

  if (body?.stream === false) {
    return Response.json(runLocalModel(model, prompt));
  }

  const encoder = new TextEncoder();
  let frame = 0;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        frame += 1;
        controller.enqueue(encoder.encode(`id: ${frame}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      try {
        for await (const piece of streamLocalModel(model, prompt)) {
          send({ type: 'delta', text: piece });
        }
        send({ type: 'done', provider: 'aetherion-own', model, offline: true });
      } catch (e) {
        send({ type: 'error', error: String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
