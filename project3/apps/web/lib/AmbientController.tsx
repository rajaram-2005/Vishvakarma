'use client';
// SUTRA — keeps the optional ambient soundscape in sync with settings.
// OFF by default; starts only after a user interaction (browser policy).

import { useEffect } from 'react';
import { useSutra } from './store';
import { ambient } from './audio';

export function AmbientController() {
  const { s } = useSutra();
  const on = s.settings.ambientSound;
  const vol = s.settings.ambientVolume;

  useEffect(() => {
    ambient.setVolume(vol);
  }, [vol]);

  useEffect(() => {
    if (!on) {
      ambient.stop();
      return;
    }
    const start = () => {
      ambient.start();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      ambient.stop();
    };
  }, [on]);

  return null;
}
