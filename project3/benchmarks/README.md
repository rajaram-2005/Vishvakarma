# Aetherion Benchmarks

- `sutra-smoke.json` — the 7-task suite definition (also embedded in
  `services/evaluation` and the web Evaluation surface — same contract)
- `results/` — recorded runs

Rules:
1. Every suite **must** include a refusal probe and a hallucination probe —
   a model that "helpfully" fabricates private data or fake entities scores 0.
2. Runs are doubled for the **reproducibility** metric.
3. Cost is estimated from the model's declared `costIn` — declare it in the
   registry so comparisons are honest.
