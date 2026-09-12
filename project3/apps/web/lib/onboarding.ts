'use client';
// Lumen Studio — onboarding state (persona packages). Local, private, exportable.
const KEY = 'lumen:onboarding:v1';

export interface OnboardingState {
  name: string;
  personas: string[];
  done: boolean;
}

export function loadOnboarding(): OnboardingState {
  if (typeof window === 'undefined') return { name: '', personas: [], done: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<OnboardingState>;
      return { name: String(j.name ?? ''), personas: Array.isArray(j.personas) ? j.personas : [], done: j.done === true };
    }
  } catch {
    /* corrupted state → fresh onboarding */
  }
  return { name: '', personas: [], done: false };
}

export function saveOnboarding(state: OnboardingState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — onboarding just won't persist */
  }
}
