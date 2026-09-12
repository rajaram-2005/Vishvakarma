/**
 * RAVANA · Mesh binding — the real LlmLike. Every call goes through the Aetheris provider mesh
 * (route()), so RAVANA inherits health tracking, cooldowns, keyless providers, locality policy and
 * streaming-safe failover. The model router fixes the candidate chain per role; route() walks it.
 */
import { route } from "@/aetheris/lib/router/router";
import type { LlmLike, LlmRequest, LlmResponse } from "./base";
import { ROLE_PROMPT } from "./base";
import { selectCandidates, type ModelSelection } from "../routing/model_router";

export class MeshLlm implements LlmLike {
  readonly engine = "mesh" as const;
  constructor(private readonly onSelected?: (sel: ModelSelection) => void) {}

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const sel = selectCandidates(req.role, { avoidModels: req.avoid, hasImages: !!req.images?.length });
    this.onSelected?.(sel);
    if (!sel.primary) throw new Error(`RAVANA model router: no provider configured for role "${req.role}" — set a provider key or run with the preview engine`);
    const messages = [
      { role: "system" as const, content: req.system || ROLE_PROMPT[req.role] },
      { role: "user" as const, content: req.prompt, ...(req.images?.length ? { images: req.images } : {}) },
    ];
    const res = await route({
      messages,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      signal: req.signal,
      policy: {
        task: req.role === "fast" ? "fast" : req.role === "coding" ? "coding" : "reasoning",
        needsTools: req.role === "coding",
        locality: (process.env.AETHERIS_LOCALITY as "local" | "prefer_local" | "remote" | "any" | undefined) ?? "any",
        avoidModels: req.avoid,
      },
    });
    return { content: res.content, provider: res.provider, model: res.model };
  }
}
