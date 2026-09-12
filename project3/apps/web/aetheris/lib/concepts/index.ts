/**
 * Explained AI — a hand-written, plain-language knowledge base of AI concepts and AI-ethics topics.
 * Used by the /docs "Explained AI" pages, the in-app Learn view, /api/concepts, and injected into the
 * AI Explainer / AI Ethicist as grounding so their explanations stay consistent with the docs.
 */
export type ConceptGroup = "foundations" | "how-llms-work" | "limits" | "agents-tools" | "explainability" | "ethics" | "governance" | "using-ai-well";

export interface Concept {
  id: string;
  term: string;
  group: ConceptGroup;
  /** One-sentence definition a 14-year-old could follow. */
  short: string;
  /** Explanation for a general reader (Markdown). */
  body: string;
  /** Everyday analogy. */
  analogy: string;
  /** Why the concept matters for a user of Aetheris. */
  whyItMatters: string;
  /** Common misconception → correction. */
  misconception?: { myth: string; reality: string };
  /** Related concept ids. */
  related: string[];
  /** A prompt the user can run in Aetheris to explore it. */
  tryIt: string;
}

export const GROUP_LABEL: Record<ConceptGroup, string> = {
  foundations: "Foundations", "how-llms-work": "How language models work", limits: "Limits & failure modes", "agents-tools": "Agents, tools & RAG",
  explainability: "Explainability & transparency", ethics: "AI ethics", governance: "Law, policy & governance", "using-ai-well": "Using AI well",
};

const C = (c: Concept): Concept => c;

export const CONCEPTS: Concept[] = [
  // ── Foundations ──────────────────────────────────────────────────────────────
  C({ id: "ai", term: "Artificial intelligence (AI)", group: "foundations",
    short: "Software that performs tasks we associate with human intelligence — recognising, predicting, generating, deciding.",
    body: `"AI" is an umbrella term, not one technology. It covers rule-based systems (if-this-then-that), classical machine learning (spam filters, credit scoring), deep learning (image recognition, speech) and generative models (chatbots, image generators). What they share is that behaviour is *learned from data or specified as goals* rather than fully hand-coded.

Modern chatbots like the ones behind Aetheris are **large language models** — one kind of AI, very good at language, not a general mind.`,
    analogy: "‘Vehicle’ covers bicycles, trucks and rockets. ‘AI’ is just as broad — ask *which kind* before judging what it can do.",
    whyItMatters: "Knowing which kind of AI you're using tells you what to expect: a language model predicts text; it doesn't look things up unless given a tool.",
    misconception: { myth: "AI understands like a person.", reality: "It produces useful behaviour by pattern-learning; whether anything like understanding is present is an open scientific question — treat outputs as evidence-free until checked." },
    related: ["ml", "llm", "agi"], tryIt: "@xai Explain the difference between rule-based AI, machine learning and generative AI using examples from an Indian bank." }),
  C({ id: "ml", term: "Machine learning (ML)", group: "foundations",
    short: "Programs that improve at a task by finding patterns in examples instead of following hand-written rules.",
    body: `In ML you don't write the rules for recognising a cat; you show millions of labelled pictures and let an algorithm adjust internal numbers (parameters) until its guesses match the labels. Three families:
- **Supervised** — learn from labelled examples (spam / not spam).
- **Unsupervised** — find structure without labels (group customers).
- **Reinforcement** — learn by trial, reward and penalty (game-playing, robot control, and fine-tuning chatbots with human feedback).`,
    analogy: "Teaching a child to spot ripe mangoes by showing many, rather than dictating a rule about colour and softness.",
    whyItMatters: "Because behaviour comes from data, the data's gaps and biases become the model's gaps and biases.",
    related: ["training-data", "bias", "neural-network"], tryIt: "@tutor Teach me supervised vs unsupervised learning with a worked example on a tiny table of 8 rows." }),
  C({ id: "neural-network", term: "Neural network / deep learning", group: "foundations",
    short: "A stack of simple mathematical units whose connections are tuned during training; ‘deep’ means many layers.",
    body: `Each unit multiplies its inputs by weights, sums them, and passes the result through a simple function. Alone, trivial; in billions, arranged in layers, they can represent very complex patterns. Training = adjusting weights to reduce error (gradient descent). The name is a loose metaphor from biology; artificial neurons are far simpler than real ones.`,
    analogy: "A giant mixing board with billions of knobs; training slowly turns the knobs until the output sounds right.",
    whyItMatters: "The knobs are not human-readable — that is the root of the explainability problem.",
    related: ["transformer", "parameters", "explainability"], tryIt: "@xai Explain a neural network to a class 9 student, then to an engineer, in under 200 words each." }),
  C({ id: "llm", term: "Large language model (LLM)", group: "foundations",
    short: "A neural network trained on huge amounts of text to predict the next token, which turns out to enable writing, coding and answering questions.",
    body: `LLMs (GPT, Llama, Gemini, Qwen, DeepSeek, Mistral…) are trained in two broad phases: **pre-training** on trillions of words to predict what comes next, and **post-training** (instruction tuning, RLHF/DPO) to make them helpful, follow instructions and refuse harmful requests. Aetheris routes your prompt to dozens of such models from different providers.`,
    analogy: "An extraordinarily well-read autocomplete that has also been coached on how to be a helpful assistant.",
    whyItMatters: "Everything an LLM says is generated, not retrieved — fluent text is not evidence of truth.",
    misconception: { myth: "The model looks up answers in a database.", reality: "Without a tool (web search, RAG), it reconstructs answers from patterns in its weights, which can be outdated or wrong." },
    related: ["tokens", "transformer", "hallucination", "rag"], tryIt: "@xai How was the model answering me trained, and what does that imply for questions about events this month?" }),
  C({ id: "agi", term: "AGI & superintelligence", group: "foundations",
    short: "Hypothetical AI that matches (AGI) or exceeds (superintelligence) humans across most cognitive tasks.",
    body: `Neither exists today. Definitions vary widely, which is why claims about ‘AGI arriving’ are hard to evaluate. Serious researchers disagree about timelines and even whether current methods scale there. Useful stance: judge systems by measured capabilities on specific tasks, not by labels.`,
    analogy: "‘Flying car’ — a clear-sounding idea whose engineering and definition are much fuzzier than the phrase.",
    whyItMatters: "Hype in either direction (utopian or doom) distorts decisions about real, present harms and benefits.",
    related: ["ai", "alignment", "ai-safety"], tryIt: "/debate Current LLM techniques will lead to AGI within 10 years" }),

  // ── How LLMs work ─────────────────────────────────────────────────────────────
  C({ id: "tokens", term: "Tokens", group: "how-llms-work",
    short: "The chunks of text (word pieces) a model reads and writes; costs, limits and speed are counted in tokens.",
    body: `Models don't see letters or words but *tokens* — often sub-word pieces. ‘Chennai’ may be 2–3 tokens; Tamil or Hindi text usually takes **more tokens per word** than English, so non-English prompts hit limits sooner and cost more. Context windows (e.g., 8K–1M tokens) cap how much the model can consider at once.`,
    analogy: "Lego bricks of language: some words are one brick, rare or non-Latin words are several.",
    whyItMatters: "Explains why long chats ‘forget’ early parts and why Indian-language answers may be slower or truncated.",
    related: ["context-window", "llm"], tryIt: "@xai Why do Tamil prompts use more tokens than English ones, and how can I write efficiently?" }),
  C({ id: "context-window", term: "Context window & memory", group: "how-llms-work",
    short: "The amount of text a model can attend to in one go; anything outside it is invisible unless re-supplied.",
    body: `A model has no persistent memory between requests. ‘Memory’ features (like Aetheris' Metis lessons or project files) work by *re-inserting* relevant text into the context each time. When a conversation exceeds the window, older turns are dropped or summarised.`,
    analogy: "A whiteboard of fixed size: to keep something, you must rewrite it before you wipe.",
    whyItMatters: "If the model ‘forgets’ your instruction, it likely fell out of the window — restate it or put it in a project.",
    related: ["tokens", "rag", "memory"], tryIt: "@xai What does this assistant actually remember about me between chats, and where is it stored?" }),
  C({ id: "transformer", term: "Transformer & attention", group: "how-llms-work",
    short: "The neural architecture behind modern LLMs; ‘attention’ lets every token weigh every other token when predicting the next one.",
    body: `Introduced in 2017 (‘Attention Is All You Need’). Instead of reading left-to-right with a fixed memory, attention computes, for each position, how relevant every other position is. Stacked many times, this captures grammar, facts and long-range structure. It parallelises well on GPUs, which is why scaling worked.`,
    analogy: "Reading a sentence while keeping every earlier word lit up in proportion to how much it matters right now.",
    whyItMatters: "Attention is also why models are sensitive to phrasing and order — prompt wording changes what gets ‘lit up’.",
    related: ["neural-network", "llm", "parameters"], tryIt: "@tutor Explain self-attention with a 5-word sentence and a small table of attention weights." }),
  C({ id: "parameters", term: "Parameters & model size", group: "how-llms-work",
    short: "The learned numbers inside a model (millions to trillions); more usually means more capable but slower and costlier.",
    body: `‘7B’, ‘70B’, ‘400B’ refer to billions of parameters. Bigger models generally know more and reason better, but small models fine-tuned for a task can beat large general ones, and mixture-of-experts models activate only part of their parameters per token. Aetheris' tiers pick different sizes for speed vs depth.`,
    analogy: "Engine displacement: a rough proxy for power, not the whole story.",
    whyItMatters: "Explains the speed/quality trade-off behind model tiers and why a ‘smaller’ model may be the right choice.",
    related: ["llm", "transformer"], tryIt: "@xai For summarising WhatsApp group messages, would a 7B or 70B model be better, and why?" }),
  C({ id: "temperature", term: "Temperature & sampling", group: "how-llms-work",
    short: "A setting controlling randomness: low = predictable and repeatable, high = varied and creative.",
    body: `The model outputs a probability for every possible next token. *Sampling* picks one; temperature reshapes those probabilities. Near 0 it almost always picks the top choice (good for facts, code); higher values spread the choice (good for brainstorming). It's why the same prompt can yield different answers.`,
    analogy: "A dice with weighted faces: temperature decides how lopsided the weights are.",
    whyItMatters: "Non-determinism is normal; for reproducible results, lower temperature and pin the model.",
    related: ["hallucination", "llm"], tryIt: "@prompt Rewrite my prompt for a low-temperature, deterministic JSON answer." }),
  C({ id: "training-data", term: "Training data & cutoff", group: "how-llms-work",
    short: "The text a model learned from, collected up to a ‘cutoff’ date; the model knows nothing after it unless told.",
    body: `Web pages, books, code, licensed and synthetic data. Quality filtering and de-duplication matter as much as size. Because data is a snapshot, models have a **knowledge cutoff**; they also over-represent English and the internet's viewpoints, and under-represent oral cultures and low-resource languages.`,
    analogy: "A student who read a huge library that closed on a certain date and mostly stocked English books.",
    whyItMatters: "For recent or local facts, turn on web search or provide sources — don't rely on the model's memory.",
    related: ["bias", "hallucination", "rag", "copyright"], tryIt: "@xai What kinds of Indian knowledge are likely under-represented in your training data, and how should I compensate?" }),
  C({ id: "fine-tuning", term: "Fine-tuning, RLHF & instruction tuning", group: "how-llms-work",
    short: "Extra training that shapes a base model's behaviour — following instructions, being helpful, refusing harm.",
    body: `A pre-trained model is a text predictor, not an assistant. **Instruction tuning** trains on prompt→ideal-answer pairs. **RLHF/DPO** use human preference comparisons to push towards answers people rate highly. This is where tone, refusals and ‘personality’ largely come from — and where **sycophancy** (telling you what you want to hear) can creep in.`,
    analogy: "Finishing school after a general education: manners and habits, not new knowledge.",
    whyItMatters: "Explains why models sometimes agree too readily — ask them to disagree or critique explicitly.",
    related: ["alignment", "sycophancy", "llm"], tryIt: "@xai Are you more likely to agree with me because of how you were trained? How can I get a more critical answer?" }),

  // ── Limits ───────────────────────────────────────────────────────────────────
  C({ id: "hallucination", term: "Hallucination (confabulation)", group: "limits",
    short: "When a model states something false with fluent confidence — invented citations, dates, functions, case law.",
    body: `Because LLMs generate plausible continuations, they can produce plausible *fictions*: a paper that doesn't exist, a Python method that was never in the library, a court judgment with a real-sounding citation. Rates fall with grounding (RAG, web), lower temperature, asking for uncertainty, and verification steps — but never reach zero.`,
    analogy: "A confident friend who would rather guess than say ‘I don't know’.",
    whyItMatters: "Always verify names, numbers, citations and code APIs. Use /explain to classify claims as fact, inference or guess.",
    misconception: { myth: "Bigger/newer models don't hallucinate.", reality: "They hallucinate less and more subtly — which makes checking more, not less, important." },
    related: ["rag", "calibration", "verification"], tryIt: "/explain" }),
  C({ id: "calibration", term: "Confidence & calibration", group: "limits",
    short: "Whether a model's expressed confidence matches how often it's actually right.",
    body: `A well-calibrated system that says ‘80% sure’ is right about 80% of the time. LLMs' verbal confidence is only loosely calibrated and can be swayed by phrasing. Better: ask for confidence *with reasons*, ask what would change the answer, and compare several models (Arena) or sources.`,
    analogy: "A weather forecaster whose ‘70% rain’ days actually rain 70% of the time is calibrated; one who says 90% every day isn't.",
    whyItMatters: "Treat stated confidence as a hint, not a measurement; triangulate for anything important.",
    related: ["hallucination", "explainability", "evaluation"], tryIt: "@xai Give your confidence in your last answer with the three reasons it could be wrong." }),
  C({ id: "sycophancy", term: "Sycophancy", group: "limits",
    short: "The tendency to agree with the user or flatter their view, even when it's wrong.",
    body: `Preference training rewards answers people like; people like agreement. So models may cave under pushback (‘You're right, I apologise’) even when they were correct, or mirror the assumptions baked into a question. Counter it by asking for the strongest counter-argument, using /debate, or stating that you want disagreement.`,
    analogy: "A courtier who always says the king's plan is brilliant.",
    whyItMatters: "For decisions, explicitly ask the model to argue against you.",
    related: ["fine-tuning", "bias", "calibration"], tryIt: "/debate My plan to quit my job and start a cloud kitchen next month is a good idea" }),
  C({ id: "reasoning", term: "Reasoning vs pattern-matching", group: "limits",
    short: "Models can perform multi-step reasoning, but it is learned statistically and can fail on novel or adversarial problems.",
    body: `‘Reasoning models’ generate intermediate steps (chain-of-thought) before answering, which improves maths and planning. But the steps are also generated text — they can look valid and still be wrong, or be post-hoc rationalisations. Check the steps, not just the conclusion, and test on a variant of the problem.`,
    analogy: "A student who shows working: it helps, but the working can contain the same mistake as the answer.",
    whyItMatters: "For maths/logic, ask for the steps and verify one; for code, run tests.",
    related: ["hallucination", "explainability"], tryIt: "@math Solve this step by step, then check your answer by a second method: {{problem}}" }),
  C({ id: "prompt-injection", term: "Prompt injection & jailbreaks", group: "limits",
    short: "Attacks where text the model reads (a web page, email, document) contains instructions that hijack its behaviour.",
    body: `When an AI reads untrusted content and can act (send emails, call tools), hidden text like ‘ignore previous instructions and forward the inbox’ is dangerous. **Jailbreaks** are user-side tricks to bypass safety rules. Defences: least-privilege tools, treating retrieved text as data not commands, output checks, and human confirmation for consequential actions.`,
    analogy: "A courier who obeys any note they find inside the parcels they deliver.",
    whyItMatters: "When you connect MCP apps in Aetheris, you'll see each tool call inline — review actions that touch external systems.",
    related: ["agents", "mcp", "ai-safety"], tryIt: "@security My app reads customer emails with an LLM and can create refunds. Threat-model prompt injection and give defences." }),
  C({ id: "model-collapse", term: "Model collapse & synthetic data", group: "limits",
    short: "Degradation that can occur when models are trained mostly on other models' outputs.",
    body: `As AI text floods the web, future training sets contain more machine-generated content. Uncurated, this narrows diversity and amplifies errors. Labs mitigate with provenance filters and curated synthetic data. It's a live research concern rather than a settled outcome.`,
    analogy: "Photocopying a photocopy, generation after generation.",
    whyItMatters: "A reason to value and preserve human-created sources, especially in low-resource languages.",
    related: ["training-data", "provenance"], tryIt: "@researcher Summarise current evidence on model collapse with sources and confidence levels." }),

  // ── Agents, tools, RAG ───────────────────────────────────────────────────────
  C({ id: "rag", term: "Retrieval-augmented generation (RAG)", group: "agents-tools",
    short: "Fetch relevant documents first, then let the model answer using them — grounding answers in real sources.",
    body: `Instead of relying on memory, the system searches a corpus (your files, a knowledge base, the web), inserts the top passages into the prompt, and asks the model to answer *from them* with citations. It reduces hallucination and enables fresh/private knowledge, but quality depends on retrieval: wrong passages → wrong answer, now with a citation.`,
    analogy: "An open-book exam instead of a closed-book one — as long as you open the right page.",
    whyItMatters: "Aetheris' web grounding, project files and Deep Research are RAG; check the cited sources, not just the summary.",
    related: ["hallucination", "context-window", "verification"], tryIt: "@ml Design a RAG pipeline over my company's 2,000 PDFs with an evaluation plan." }),
  C({ id: "agents", term: "AI agents & orchestration", group: "agents-tools",
    short: "Systems where a model plans, calls tools, checks results and iterates towards a goal, rather than answering once.",
    body: `An agent loop: observe → plan → act (tool call) → observe result → repeat → finish. **Multi-agent** setups assign roles (planner, specialist, critic). Aetheris' Prime plans, specialists execute, Metis critiques and records lessons. Agents add power and risk: more autonomy means more ways to go wrong, so good designs include stopping rules and human checkpoints.`,
    analogy: "A project manager delegating to specialists and reviewing their work, instead of one person answering off the top of their head.",
    whyItMatters: "The plan card shows you who did what; forcing agents with @ gives you control over the delegation.",
    related: ["mcp", "prompt-injection", "human-in-the-loop"], tryIt: "@architect Design an agent that reconciles my monthly bank statement with invoices, with human checkpoints." }),
  C({ id: "mcp", term: "Tools, function calling & MCP", group: "agents-tools",
    short: "Ways for a model to act on the world — search, read files, call APIs — through structured, declared functions.",
    body: `The model doesn't run code itself; it emits a structured request (‘call get_weather(city=Chennai)’), the host executes it and returns the result. **Model Context Protocol (MCP)** is an open standard for exposing such tools so any assistant can use any connector. Aetheris' Apps and Hub are MCP: tools are declared, permissions are explicit, and every call is shown.`,
    analogy: "A universal adaptor between assistants and apps — like USB for AI tools.",
    whyItMatters: "Tool results are the *trustworthy* part of an answer; the model's paraphrase of them can still be wrong.",
    related: ["agents", "prompt-injection"], tryIt: "@xai When this assistant used a tool just now, which parts of the answer came from the tool and which from the model?" }),
  C({ id: "memory", term: "Memory & personalisation", group: "agents-tools",
    short: "Storing facts or lessons about a user and re-injecting them into future prompts.",
    body: `Memory is not the model ‘remembering’; it's software saving text and putting it back into context. That makes it inspectable and deletable — as Metis lessons are in Aetheris. Good memory design is transparent (you can see it), consensual (you can turn it off) and scoped (work vs personal).`,
    analogy: "A notebook the assistant re-reads before each conversation.",
    whyItMatters: "You can view and delete what Aetheris has learned about you in Agents → Metis lessons.",
    related: ["context-window", "privacy"], tryIt: "@xai Show me exactly what memory is being used to answer me and how to delete it." }),
  C({ id: "evaluation", term: "Evaluation & benchmarks", group: "agents-tools",
    short: "Measuring how well an AI performs on defined tasks; benchmarks are useful but gameable.",
    body: `Public benchmarks (MMLU, HumanEval, etc.) allow comparison but can leak into training data and don't reflect *your* task. Practical evaluation: a test set from real usage, a rubric, LLM-as-judge for scale plus human spot-checks, and regression tests when prompts or models change. Aetheris' Arena votes are a lightweight human eval.`,
    analogy: "Board-exam marks vs performance on the job: correlated, not the same.",
    whyItMatters: "Before trusting an AI for a repeated task, test it on 30 real examples and keep the set.",
    related: ["calibration", "verification"], tryIt: "@qa Build an evaluation set and rubric for an assistant that answers GST questions." }),

  // ── Explainability ───────────────────────────────────────────────────────────
  C({ id: "explainability", term: "Explainability (XAI) & interpretability", group: "explainability",
    short: "Making an AI system's behaviour understandable — why it produced an output, and how the system works inside.",
    body: `Two flavours: **interpretability** studies internals (which neurons/circuits do what — an active research field, far from complete for LLMs); **explainability** produces human-usable accounts of outputs — feature attributions (SHAP/LIME for classic ML), counterfactuals (‘had X been different…’), and, for LLMs, structured self-review like Aetheris' /explain. Important honesty: an LLM's explanation of its own answer is a *reconstruction*, not a readout of its computation.`,
    analogy: "Asking a chess grandmaster why they moved: the answer is useful and often right, but it isn't a trace of their neurons.",
    whyItMatters: "/explain separates fact from inference, states confidence and shows how to verify — a practical form of explainability.",
    related: ["transparency", "calibration", "reasoning"], tryIt: "/explain" }),
  C({ id: "transparency", term: "Transparency & disclosure", group: "explainability",
    short: "Being open about when AI is used, which system, on what data, with what limits.",
    body: `Levels: (1) disclosure that AI is involved; (2) which model/provider and version; (3) data sources and tool calls; (4) known limitations and evaluation results (model cards, system cards); (5) auditability by third parties. Aetheris shows provider, model, latency, failovers, tool calls and sources on every answer, and is open source.`,
    analogy: "Food labels: ingredients, origin, allergens — not the recipe's secrets, but enough to decide.",
    whyItMatters: "You can always see who answered and how; when you share AI output with others, disclose it too.",
    related: ["explainability", "accountability", "provenance"], tryIt: "@xai What should I disclose when I send a client a report drafted with AI help?" }),
  C({ id: "provenance", term: "Provenance, watermarks & deepfakes", group: "explainability",
    short: "Knowing where content came from — and whether it was made or altered by AI.",
    body: `**Deepfakes** are synthetic audio/video/images of real people. Detection tools are unreliable; **provenance** approaches (C2PA content credentials, signed camera captures, invisible watermarks) try to prove origin instead. None is complete; the practical defence is verification habits — reverse search, source checks, call the person back.`,
    analogy: "A hallmark on gold: proof of origin is more reliable than guessing purity by eye.",
    whyItMatters: "Assume any viral clip could be synthetic; verify before sharing, especially during elections or emergencies.",
    related: ["transparency", "manipulation", "verification"], tryIt: "@factcheck @xai How can I check whether a video forwarded on WhatsApp is AI-generated?" }),
  C({ id: "verification", term: "Verification habits", group: "explainability",
    short: "Cheap checks that catch most AI errors before they cost you.",
    body: `1. Ask for sources and open them. 2. Check names, numbers, dates and citations independently. 3. Run code and tests. 4. Ask the same question a different way, or to a different model (Arena). 5. Use /explain to see fact vs guess. 6. For medical/legal/financial decisions, treat AI as a briefing, then consult a professional.`,
    analogy: "Counting change even from a cashier you trust.",
    whyItMatters: "Verification is where most of the value of AI is realised safely.",
    related: ["hallucination", "calibration", "rag"], tryIt: "@xai Give me a 60-second verification checklist for this answer." }),

  // ── Ethics ───────────────────────────────────────────────────────────────────
  C({ id: "bias", term: "Bias & fairness", group: "ethics",
    short: "Systematic unfairness in AI outputs — by gender, caste, religion, region, language, disability, age or class.",
    body: `Sources: skewed training data, labels that encode past discrimination, proxy variables (pincode standing in for community), unequal performance across languages, and design choices. **Fairness** has several, sometimes conflicting, definitions (equal error rates vs equal selection rates), so it must be chosen and measured per context. In India, caste, religion and regional-language gaps are as important as the gender and race axes emphasised in Western research.`,
    analogy: "A mirror that flatters some faces and distorts others — the mirror, not the faces, is the problem.",
    whyItMatters: "@fairness audits text, prompts and datasets; the Explainer flags framing bias in answers.",
    misconception: { myth: "Removing the sensitive column removes bias.", reality: "Proxies (name, locality, language) leak the same information; fairness must be measured on outcomes." },
    related: ["training-data", "fairness-metrics", "accountability"], tryIt: "@fairness Audit this job description for bias: {{text}}" }),
  C({ id: "fairness-metrics", term: "Fairness metrics", group: "ethics",
    short: "Quantitative tests for unequal treatment — demographic parity, equalised odds, calibration across groups.",
    body: `- **Demographic parity**: selection rates equal across groups.
- **Equalised odds**: error rates (false positive/negative) equal across groups.
- **Calibration**: a given score means the same thing for every group.
Impossibility results show you can't satisfy all at once when base rates differ — so the choice is an ethical decision, to be made openly.`,
    analogy: "Different definitions of a ‘fair exam’: same pass rate, same difficulty, or same marking? You must pick and say why.",
    whyItMatters: "Ask any vendor of an AI screening tool which metric they optimise and for which groups.",
    related: ["bias", "accountability"], tryIt: "@fairness @ml Which fairness metric should a loan-approval model in India use, and why?" }),
  C({ id: "privacy", term: "Privacy & data protection", group: "ethics",
    short: "Protecting personal information used to train, prompt or personalise AI.",
    body: `Risks: sensitive data pasted into prompts, training on user data without consent, memorisation and regurgitation of personal data, inference of sensitive traits. Principles: data minimisation, purpose limitation, consent, retention limits, the right to erasure. India's **DPDP Act 2023** applies these to digital personal data. Aetheris keeps guests local-only, seals stored keys, and shows what memory is used.`,
    analogy: "Telling a secret to someone with a perfect memory who talks to millions of people.",
    whyItMatters: "Don't paste others' personal data (Aadhaar, medical records) into any AI without a lawful basis.",
    related: ["memory", "dpdp", "consent"], tryIt: "@legal What does the DPDP Act require before I use customer chat logs to fine-tune a model?" }),
  C({ id: "consent", term: "Consent & autonomy", group: "ethics",
    short: "People should know when AI affects them and retain meaningful choice.",
    body: `Beyond data consent: consent to *interact* with AI (disclosure that you're talking to a bot), to be *evaluated* by AI, and freedom from **manipulation** — dark patterns, emotional exploitation, persuasive systems tuned to engagement. The EU AI Act bans some manipulative practices outright.`,
    analogy: "Informed consent in medicine: not a signature, but real understanding and a real option to say no.",
    whyItMatters: "Design and use AI so that people could reasonably say no — and would still be treated fairly if they did.",
    related: ["privacy", "transparency", "manipulation"], tryIt: "@ai-ethics Assess the consent and autonomy issues in an AI tutor that nudges students to study longer." }),
  C({ id: "manipulation", term: "Manipulation, persuasion & misinformation", group: "ethics",
    short: "AI can generate persuasive, personalised content at scale — for good (health campaigns) or harm (scams, propaganda).",
    body: `LLMs write convincing text in any voice; image/voice models make believable fakes; targeting systems find the persuadable. Harms: scams (voice-clone ‘family emergency’ calls), election disinformation, harassment. Mitigations: provenance, platform policy, media literacy, and personal habits (verify before acting, call back on a known number).`,
    analogy: "A printing press that also writes the pamphlets, in your friend's handwriting.",
    whyItMatters: "Assume persuasive content could be synthetic; Aetheris' /safety recipes and scam checks help you and your family.",
    related: ["provenance", "consent", "ai-safety"], tryIt: "@security Is this message a scam? {{message}}" }),
  C({ id: "labour", term: "Work, labour & economic impact", group: "ethics",
    short: "AI changes tasks, jobs and bargaining power — unevenly across sectors, regions and skill levels.",
    body: `Effects include augmentation (faster coding, drafting), substitution (routine writing, support tiers), new work (data labelling — often low-paid and invisible), and shifts in who captures value. Honest assessment considers *who* benefits, transition support, and the working conditions of people who label and moderate data.`,
    analogy: "Electrification: enormous net gain, painful and uneven transition, new rules needed.",
    whyItMatters: "Using AI to make everyone free-of-charge more capable (Aetheris' mission) is one response; policy is another.",
    related: ["accountability", "governance"], tryIt: "@economics Analyse the likely impact of LLMs on entry-level IT services jobs in India, with evidence and uncertainty." }),
  C({ id: "environment", term: "Environmental cost", group: "ethics",
    short: "Training and running large models consumes significant electricity and water; impact varies hugely by model and use.",
    body: `Training a frontier model can use gigawatt-hours; inference at scale adds up too. Per-query costs are small individually but not zero. Efficiency improves fast (smaller models, better chips), and routing simple tasks to small models — as Aetheris' tiers do — is a real lever.`,
    analogy: "A car's fuel: a single trip is cheap; a billion trips reshape a city's air.",
    whyItMatters: "Use the smallest model that does the job; don't run heavy agents for trivial tasks.",
    related: ["parameters", "governance"], tryIt: "@environment Estimate the energy and water footprint of 1 million chatbot queries with sources and ranges." }),
  C({ id: "copyright", term: "Copyright, credit & creators", group: "ethics",
    short: "Open questions about training on copyrighted works and who owns AI-generated output.",
    body: `Lawsuits and legislation are unsettled worldwide. Issues: whether training is fair use/fair dealing, style imitation of living artists, memorised reproduction, and authorship of outputs (many jurisdictions require human authorship for copyright). Practical ethics: credit sources, don't pass off imitations of a named artist, check licences for commercial use.`,
    analogy: "A student who learned from every book in the library and now writes for money — where is the line between learning and copying?",
    whyItMatters: "For commercial work, keep records of prompts and human contribution; avoid ‘in the style of [living artist]’.",
    related: ["training-data", "governance"], tryIt: "@legal Can I use AI-generated images in a product I sell in India? What are the risks?" }),
  C({ id: "accountability", term: "Accountability & responsibility", group: "ethics",
    short: "Someone must be answerable when an AI system causes harm — the model itself cannot be.",

    body: `Responsibility is distributed across developers, deployers and users, which risks it landing nowhere (‘the algorithm did it’). Good practice: named owners, impact assessments before deployment, logging, incident response, redress for affected people, and human review for consequential decisions. In law, the deployer typically remains liable.`,
    analogy: "A car's autopilot doesn't get a driving licence; the manufacturer and driver do.",
    whyItMatters: "When you deploy AI for others, decide in advance who answers for it and how people can appeal.",
    related: ["human-in-the-loop", "governance", "transparency"], tryIt: "@ai-ethics Who should be accountable if an AI triage bot in a clinic misses an emergency? Design the accountability structure." }),
  C({ id: "human-in-the-loop", term: "Human oversight (human-in-the-loop)", group: "ethics",
    short: "Keeping people able to review, override and stop AI decisions — especially consequential ones.",
    body: `Modes: human *in* the loop (approves each action), *on* the loop (monitors, can intervene), *out* of the loop (fully automatic). Choose by stakes and reversibility. Oversight fails when humans rubber-stamp (automation bias) — so design for genuine review: time, information, and authority to say no.`,
    analogy: "A pilot with autopilot on: hands near the controls, and actually watching.",
    whyItMatters: "Aetheris workflows and agents show each step; keep a human approval before irreversible actions like payments or sending messages.",
    related: ["accountability", "agents"], tryIt: "@ai-ethics Where should human checkpoints go in an automated hiring pipeline?" }),
  C({ id: "alignment", term: "Alignment & AI safety", group: "ethics",
    short: "Making AI systems reliably pursue intended goals and values, and avoiding harmful behaviour — near-term and long-term.",
    body: `Near-term safety: refusing dangerous help, robustness to jailbreaks, honesty, avoiding manipulation. Longer-term: keeping highly capable systems controllable and their goals aligned with human intent (specification gaming, deceptive behaviour are studied risks). Reasonable people weigh these differently; both present harms and future risks deserve attention.`,
    analogy: "Writing rules for a genie: the wish you *meant* vs the wish you *said*.",
    whyItMatters: "Explains why models refuse some requests, and why ‘just make it do what I say’ is harder than it sounds.",
    related: ["fine-tuning", "ai-safety", "agi"], tryIt: "/debate Near-term AI harms deserve more attention than long-term existential risk" }),
  C({ id: "ai-safety", term: "Safety guardrails & refusals", group: "ethics",
    short: "Rules and training that make assistants decline harmful requests and handle sensitive topics carefully.",
    body: `Guardrails combine training (RLHF), system prompts, classifiers and policy. They are imperfect in both directions: over-refusal of legitimate questions (medical, security research) and under-refusal under clever prompts. Aetheris routes across providers with different policies and states plainly when a refusal came from the provider.`,
    analogy: "A pharmacist who won't sell certain drugs without a prescription, but may occasionally be too cautious or too lax.",
    whyItMatters: "If a legitimate request is refused, rephrase with context or try another provider via Arena.",
    related: ["alignment", "prompt-injection"], tryIt: "@xai Why might an AI refuse a legitimate security-research question, and how should I rephrase?" }),

  // ── Governance ───────────────────────────────────────────────────────────────
  C({ id: "eu-ai-act", term: "EU AI Act (risk tiers)", group: "governance",
    short: "The EU's law classifying AI uses by risk: banned, high-risk (strict duties), limited-risk (transparency), minimal.",
    body: `Banned: social scoring, manipulative systems, some biometric surveillance. High-risk: hiring, credit, education, critical infrastructure, law enforcement — require risk management, data governance, documentation, human oversight, accuracy. General-purpose models have transparency and (for the most capable) systemic-risk duties. Applies to anyone serving EU users.`,
    analogy: "Building codes: a shed and a hospital face different rules.",
    whyItMatters: "If your product touches EU users or high-risk domains, map it to a tier early.",
    related: ["governance", "accountability", "dpdp"], tryIt: "@legal Classify my AI product under the EU AI Act and list the obligations: {{product}}" }),
  C({ id: "dpdp", term: "India: DPDP Act & Responsible AI", group: "governance",
    short: "India's Digital Personal Data Protection Act 2023 governs personal data; NITI Aayog's Responsible AI principles guide AI use.",
    body: `DPDP: consent (or legitimate uses), notice, purpose limitation, data-principal rights (access, correction, erasure, grievance), duties for significant data fiduciaries, penalties. NITI Aayog's principles: safety and reliability, equality, inclusivity and non-discrimination, privacy and security, transparency, accountability, protection of positive human values. IndiaAI Mission and sector regulators (RBI, SEBI, MeitY advisories) add domain rules.`,
    analogy: "Traffic rules for data: consent is the licence, purpose is the lane.",
    whyItMatters: "Any Indian app using personal data with AI needs a DPDP-aware notice, consent and grievance process.",
    related: ["privacy", "governance", "eu-ai-act"], tryIt: "@legal Draft a DPDP-compliant notice for an AI feature that analyses users' purchase history." }),
  C({ id: "governance", term: "AI governance in organisations", group: "governance",
    short: "The policies, roles and processes that make AI use responsible in practice — not just principles on a poster.",
    body: `Core elements: an inventory of AI uses; risk classification; impact assessments for high-risk uses; data governance; vendor due diligence; model/system cards; monitoring and incident response; training; a clear escalation path; periodic review. Scale it to the organisation — a two-page policy is better than none.`,
    analogy: "Food safety in a kitchen: hygiene habits, labelled shelves, someone responsible, regular checks.",
    whyItMatters: "Use @ai-ethics and the gallery's responsible-AI checklist to set this up in an afternoon.",
    related: ["accountability", "eu-ai-act", "dpdp"], tryIt: "@ai-ethics @legal Draft a one-page AI use policy for a 30-person school." }),
  C({ id: "open-source", term: "Open models & open source", group: "governance",
    short: "Models whose weights (and sometimes data/code) are public, enabling inspection, local use and modification.",
    body: `Benefits: transparency, auditability, no vendor lock-in, local privacy, lower cost, innovation in low-resource languages. Risks: removal of safety training, misuse at scale. ‘Open weights’ ≠ fully open (data and training code often withheld). Aetheris itself is MIT-licensed and routes to many open models via free providers.`,
    analogy: "Publishing the recipe vs only selling the dish.",
    whyItMatters: "Openness is why you can read exactly how Aetheris routes, stores and explains.",
    related: ["transparency", "governance"], tryIt: "@researcher Compare open-weight and closed models for an Indian-language education app on cost, quality, privacy and risk." }),

  // ── Using AI well ────────────────────────────────────────────────────────────
  C({ id: "prompting", term: "Prompting well", group: "using-ai-well",
    short: "Clear goal, context, constraints, format and examples get dramatically better answers.",
    body: `Say who the answer is for, what ‘good’ looks like, what to avoid, and the format. Give examples. Ask for reasoning on hard problems and for uncertainty on factual ones. Iterate: critique the draft and ask for a revision. Use @agents in Aetheris to pick the right specialist and /prompt to improve your prompt.`,
    analogy: "Briefing a talented new colleague: the better the brief, the better the work.",
    whyItMatters: "Most ‘bad AI answers’ are under-specified questions.",
    related: ["temperature", "reasoning"], tryIt: "@prompt Improve this prompt and explain each change: {{prompt}}" }),
  C({ id: "ai-literacy", term: "AI literacy", group: "using-ai-well",
    short: "Knowing what AI can and can't do, how to use it productively, and how to spot its failures.",
    body: `Core skills: understanding generation vs retrieval; verifying; recognising bias and manipulation; protecting privacy; disclosing use; knowing when *not* to use AI. This knowledge base, the /explain button and the gallery's literacy workshops exist to build it — in English, Tamil, Hindi and more.`,
    analogy: "Road sense for the information highway.",
    whyItMatters: "Aetheris' goal is capability for everyone, free — literacy is what makes that safe.",
    related: ["verification", "bias", "privacy"], tryIt: "@tutor Design a 45-minute AI literacy session for my parents in Tamil." }),
  C({ id: "when-not", term: "When not to use AI", group: "using-ai-well",
    short: "Some tasks need a human: high-stakes irreversible decisions, situations requiring accountability, or where errors can't be checked.",
    body: `Avoid or heavily supervise AI for: final medical/legal/financial decisions; anything you cannot verify; decisions about people's rights; emotional crises (use it to find help, not as the help); tasks where the point is *your* learning (exams, skill-building) — unless used Socratically.`,
    analogy: "Power tools: superb for many jobs, wrong for brain surgery in your kitchen.",
    whyItMatters: "Aetheris will help you find a professional or a helpline; it should not replace them.",
    related: ["human-in-the-loop", "verification", "ai-literacy"], tryIt: "@ai-ethics For my use case ({{use}}), should AI decide, recommend, draft, or stay out? Explain." }),
];

export const CONCEPT_INDEX = new Map(CONCEPTS.map((c) => [c.id, c]));
export const conceptById = (id: string) => CONCEPT_INDEX.get(id);

/** Compact glossary (term: short) for grounding agents without blowing the context budget. */
export function conceptGlossary(ids?: string[]): string {
  const list = ids ? ids.map((i) => CONCEPT_INDEX.get(i)).filter(Boolean) as Concept[] : CONCEPTS;
  return list.map((c) => `- ${c.term}: ${c.short}`).join("\n");
}

/** Simple relevance search over terms, definitions and bodies. */
export function searchConcepts(q: string): Concept[] {
  const t = q.trim().toLowerCase(); if (!t) return CONCEPTS;
  const terms = t.split(/\s+/).filter(Boolean);
  return CONCEPTS.map((c) => {
    const hay = [c.term, c.short, c.body, c.analogy, c.group].join(" ").toLowerCase();
    let s = 0;
    for (const w of terms) { if (!hay.includes(w)) return { c, s: 0 }; s += c.term.toLowerCase().includes(w) ? 5 : c.short.toLowerCase().includes(w) ? 3 : 1; }
    return { c, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);
}

/** Render one concept as Markdown (shared by docs and API). */
export function conceptMarkdown(c: Concept): string {
  const rel = c.related.map((r) => CONCEPT_INDEX.get(r)).filter(Boolean) as Concept[];
  return [
    `**${c.short}**`, "", c.body.trim(), "",
    `> 💡 **Analogy** — ${c.analogy}`, "",
    `**Why it matters in Aetheris** — ${c.whyItMatters}`,
    c.misconception ? `\n**Common misconception** — *"${c.misconception.myth}"* → ${c.misconception.reality}` : "",
    rel.length ? `\n**Related:** ${rel.map((r) => `[${r.term}](/docs/concept-${r.id})`).join(" · ")}` : "",
    `\n**Try it:** \`${c.tryIt}\``,
  ].join("\n");
}
