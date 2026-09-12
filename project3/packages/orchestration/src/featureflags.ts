// §99 — Feature Flags. Every experimental feature supports
// enabled / disabled / beta / internal / deprecated.

export type FlagState = 'enabled' | 'disabled' | 'beta' | 'internal' | 'deprecated';

export class FeatureFlags {
  private flags = new Map<string, FlagState>();

  set(name: string, state: FlagState): void {
    this.flags.set(name, state);
  }

  get(name: string): FlagState {
    return this.flags.get(name) ?? 'disabled';
  }

  isEnabled(name: string): boolean {
    const s = this.get(name);
    return s === 'enabled' || s === 'beta';
  }

  isVisible(name: string): boolean {
    const s = this.get(name);
    return s !== 'disabled' && s !== 'internal';
  }

  list(): Array<{ name: string; state: FlagState }> {
    return [...this.flags.entries()].map(([name, state]) => ({ name, state }));
  }
}
