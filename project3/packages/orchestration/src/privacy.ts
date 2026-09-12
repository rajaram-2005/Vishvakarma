// §67 / §68 — Privacy Modes and No-Training / Data-Policy Display.
//
// Maximum Privacy prioritizes local processing and blocks cloud unless allowed.
// For connected providers we show the applicable data-processing behavior
// when known (and make no unsupported claims).

import type { RuntimeKind } from './types';

export type PrivacyMode = 'maximum' | 'balanced' | 'cloud-optimized';

export interface DataPolicy {
  provider: string;
  training: 'none' | 'may-use' | 'opt-out' | 'unknown';
  logs: 'none' | 'short-lived' | 'retained' | 'unknown';
  retention: string;
  note: string;
}

const KNOWN_POLICIES: Record<string, DataPolicy> = {
  'local/ollama': {
    provider: 'local/ollama',
    training: 'none',
    logs: 'none',
    retention: 'stays on device',
    note: 'Runs entirely on your machine. Nothing leaves the device.',
  },
  'openai-compat': {
    provider: 'openai-compat',
    training: 'opt-out',
    logs: 'short-lived',
    retention: '30 days (API default; verify per provider)',
    note: 'Cloud provider. Some providers may use data for improvement unless you opt out.',
  },
  sutra: {
    provider: 'sutra',
    training: 'none',
    logs: 'none',
    retention: 'not retained by default',
    note: 'Local-first provider; data stays local when in local mode.',
  },
};

/**
 * §67 — Does a runtime satisfy the active privacy mode?
 * Maximum Privacy rejects cloud runtimes unless explicitly local-only.
 */
export function satisfiesPrivacy(mode: PrivacyMode, runtime: RuntimeKind, local: boolean): boolean {
  if (mode === 'maximum') return local || runtime === 'local' || runtime === 'edge';
  if (mode === 'balanced') return true; // local preferred but cloud allowed
  return true; // cloud-optimized
}

/** §68 — Show the known data-processing policy for a provider. */
export function dataPolicy(provider: string): DataPolicy {
  return (
    KNOWN_POLICIES[provider] ?? {
      provider,
      training: 'unknown',
      logs: 'unknown',
      retention: 'unknown',
      note: 'No published data-processing policy is known for this provider.',
    }
  );
}

export const PRIVACY_MODES: PrivacyMode[] = ['maximum', 'balanced', 'cloud-optimized'];
