export type MediaKind = "image" | "audio" | "video";

export interface MediaProviderConfig {
  id: string;
  name: string;
  kind: MediaKind;
  envKey: string;
  /** BYOK: user may supply their own key from the UI (never stored server-side). */
  byok?: boolean;
  priority: number;
  notes?: string;
}

export interface MediaResult {
  provider: string;
  kind: MediaKind;
  /** data: URL or https URL to the asset */
  url: string;
  mime: string;
  latencyMs: number;
  attempts: { provider: string; ok: boolean; error?: string }[];
}

export class MediaError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "MediaError";
  }
}
