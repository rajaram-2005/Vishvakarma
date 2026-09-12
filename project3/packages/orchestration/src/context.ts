// §22 / §23 — Context Builder & Context Budgeting.
//
// Before calling a model, assemble System Instructions + User Request +
// Conversation + Memory + Library + Retrieved Knowledge + Tool Results +
// Task State, then enforce a context window budget by including, summarizing
// or omitting pieces by priority. Avoids blindly sending entire projects.

export interface ContextPiece {
  kind: string;
  text: string;
  priority: number; // higher = more important
  tokens?: number;
}

/** Rough token estimate (~4 chars/token), deterministic and offline. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export interface BuiltContext {
  included: ContextPiece[];
  omitted: ContextPiece[];
  summarized: ContextPiece[];
  totalTokens: number;
  usedTokens: number;
  overflow: number;
}

export class ContextBuilder {
  private pieces: ContextPiece[] = [];

  add(piece: ContextPiece): this {
    this.pieces.push({ tokens: piece.tokens ?? estimateTokens(piece.text), ...piece });
    return this;
  }

  addMany(pieces: ContextPiece[]): this {
    for (const p of pieces) this.add(p);
    return this;
  }

  /**
   * Build a context within `maxTokens`. Highest-priority pieces are included
   * first; overflow pieces are summarized (truncated) until they fit, and any
   * remaining are omitted entirely.
   */
  build(maxTokens: number): BuiltContext {
    const sorted = [...this.pieces].sort((a, b) => b.priority - a.priority);
    const included: ContextPiece[] = [];
    const summarized: ContextPiece[] = [];
    const omitted: ContextPiece[] = [];
    let used = 0;

    for (const p of sorted) {
      const t = p.tokens ?? estimateTokens(p.text);
      if (used + t <= maxTokens) {
        included.push(p);
        used += t;
      } else if (used < maxTokens) {
        // Summarize: keep what fits, mark as summarized.
        const room = maxTokens - used;
        const keepChars = Math.max(0, room * 4 - 12);
        const sumText = p.text.slice(0, keepChars).trimEnd() + ' …[summarized]';
        summarized.push({ ...p, text: sumText, tokens: estimateTokens(sumText) });
        used += summarized[summarized.length - 1].tokens ?? 0;
      } else {
        omitted.push(p);
      }
    }

    const totalTokens = this.pieces.reduce((a, p) => a + (p.tokens ?? 0), 0);
    return {
      included,
      omitted,
      summarized,
      totalTokens,
      usedTokens: used,
      overflow: Math.max(0, totalTokens - used),
    };
  }

  render(maxTokens: number): string {
    const ctx = this.build(maxTokens);
    const part = (p: ContextPiece) => `## ${p.kind}\n${p.text}`;
    return [...ctx.included, ...ctx.summarized].map(part).join('\n\n');
  }
}
