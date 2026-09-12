import { NextResponse } from 'next/server';
import { VERSION, CADENCE } from '@/aetheris/lib/version';
import { PROVIDERS } from '@/aetheris/lib/router/providers';
import { MODEL_TIERS } from '@/aetheris/lib/models/tiers';
import { OWN_MODELS } from '@/lib/localmodels/registry';

export const dynamic = 'force-dynamic';

/**
 * GET /api/status — one-line answer to “what is this thing?”
 * Aggregates the embedded Aetheris core + the own-model family for
 * deploy-health checks (Render/Fly probes) and the Models page.
 */
export async function GET() {
  const own = OWN_MODELS.map((m) => ({ id: m.id, name: m.name, strengths: m.strengths }));
  const providerStats = {
    total: PROVIDERS.length,
    keyless: PROVIDERS.filter((p) => p.keyless).length,
    keyed: PROVIDERS.filter((p) => !p.keyless).length,
  };
  return NextResponse.json({
    ok: true,
    product: 'aetherion',
    version: VERSION,
    cadence: CADENCE,
    runtime: 'nextjs',
    node: process.version,
    time: new Date().toISOString(),
    cores: {
      aetheris: {
        version: VERSION,
        health: '/api/health',
        capabilities: '/api/capabilities',
        chat: '/api/chat',
      },
      ownModels: {
        provider: 'aetherion-own',
        runtime: 'on-device',
        count: own.length,
        models: own,
        chat: '/api/localmodels/chat',
        registry: '/api/localmodels',
      },
      providerMesh: providerStats,
      virtualTiers: MODEL_TIERS.map((t) => ({ id: t.id, name: t.name, minPlan: t.minPlan })),
    },
    deploy: {
      notes:
        'Single Node.js container serves the whole product — UI, embedded Aetheris core and own-model API. Set NEXT_PUBLIC_APP_URL (optional) and any provider keys via env; no external services required.',
    },
  });
}
