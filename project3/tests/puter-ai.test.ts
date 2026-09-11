// Puter adapter — offline/local-mode safety for the AI gateway surface.
// Without window.puter everything must resolve to null/[] without throwing.

import { describe, expect, it } from 'vitest';
import { listPuterModels, puterAiAvailable, puterAiChat, puterTxt2Img } from '@sutra/puter-adapter';

describe('puter AI gateway (no puter present)', () => {
  it('reports unavailable', () => {
    expect(puterAiAvailable()).toBe(false);
  });

  it('returns empty model list', async () => {
    expect(await listPuterModels()).toEqual([]);
  });

  it('returns null from chat and image calls', async () => {
    expect(await puterAiChat([{ role: 'user', content: 'hi' }])).toBeNull();
    expect(await puterTxt2Img('a cat')).toBeNull();
  });
});
