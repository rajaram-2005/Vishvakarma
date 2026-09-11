import { NextRequest, NextResponse } from 'next/server';
import { OWN_MODELS, runLocalModel } from '@/lib/localmodels/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    provider: 'aetherion-own',
    runtime: 'on-device',
    models: OWN_MODELS.map(({ id, name, engine, tagline, description, strengths, sample }) => ({
      id,
      name,
      engine,
      tagline,
      description,
      strengths,
      sample,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { model?: string; prompt?: string } | null;
  const prompt = body?.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
  }
  let result = runLocalModel(body?.model ?? 'aetherion-local', prompt);
  if (!result.content.trim()) result = runLocalModel('aetherion-local', prompt);
  return NextResponse.json({ ...result, requestedModel: body?.model ?? null });
}
