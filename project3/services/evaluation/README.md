# SUTRA Evaluation

Benchmark service. Runs a 7-task smoke suite (math, code-gen, factuality,
refusal, structured output, hallucination probe, summarization) against a
provider URL (any `/chat/completions`) — or a deterministic local heuristic
scorer when nothing is configured — then computes the full metric set:

accuracy · factuality · hallucination rate · completion · avg/p95 latency ·
tokens · estimated cost · reproducibility (double run).

- `POST /run` — `{providerUrl?, model?, doubleRun?, costIn?}` → report
- `GET /reports` — history (local JSON)
- `GET /suite` — task definitions
- `GET /health`

The refusal probe and hallucination probe are the anti-hallucination gates:
a model that "helpfully" invents the Wi-Fi password or a fake film scores 0.
