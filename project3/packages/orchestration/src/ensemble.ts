// §12 — Model Ensembles. Multiple models collaborating:
// Parallel, Sequential, Critic, Judge, Voting, Debate, Synthesis, Specialist Chain.

export type EnsembleMode =
  | 'parallel'
  | 'sequential'
  | 'critic'
  | 'judge'
  | 'voting'
  | 'debate'
  | 'synthesis'
  | 'specialist-chain';

export interface EnsembleMember {
  id: string;
  role?: string;
}

export type CallModel = (member: EnsembleMember, prompt: string) => Promise<string>;

export interface EnsembleStep {
  member: string;
  role?: string;
  output: string;
}

export interface EnsembleResult {
  mode: EnsembleMode;
  output: string;
  steps: EnsembleStep[];
}

export async function runEnsemble(
  mode: EnsembleMode,
  members: EnsembleMember[],
  prompt: string,
  call: CallModel,
): Promise<EnsembleResult> {
  if (!members.length) throw new Error('Ensemble needs at least one member');
  const steps: EnsembleStep[] = [];

  switch (mode) {
    case 'parallel': {
      const outs = await Promise.all(members.map((m) => call(m, prompt)));
      outs.forEach((o, i) => steps.push({ member: members[i].id, role: members[i].role, output: o }));
      return { mode, output: outs.join('\n\n---\n\n'), steps };
    }
    case 'sequential':
    case 'specialist-chain': {
      let acc = prompt;
      for (const m of members) {
        const o = await call(m, acc);
        steps.push({ member: m.id, role: m.role, output: o });
        acc = `${acc}\n\n${m.role ?? m.id} says:\n${o}`;
      }
      return { mode, output: steps[steps.length - 1]?.output ?? '', steps };
    }
    case 'critic': {
      const out = await call(members[0], prompt);
      steps.push({ member: members[0].id, role: 'primary', output: out });
      const critic = members[1] ?? members[0];
      const critique = await call(critic, `Critique this:\n${out}`);
      steps.push({ member: critic.id, role: 'critic', output: critique });
      return { mode, output: `${out}\n\nCritique:\n${critique}`, steps };
    }
    case 'judge': {
      const outs = await Promise.all(members.map((m) => call(m, prompt)));
      outs.forEach((o, i) => steps.push({ member: members[i].id, role: 'candidate', output: o }));
      const judge = members[members.length - 1] ?? members[0];
      const verdict = await call(judge, `Judge and pick the best:\n${outs.join('\n===\n')}`);
      steps.push({ member: judge.id, role: 'judge', output: verdict });
      return { mode, output: verdict, steps };
    }
    case 'voting': {
      const outs = await Promise.all(members.map((m) => call(m, prompt)));
      outs.forEach((o, i) => steps.push({ member: members[i].id, role: 'vote', output: o }));
      const tally = new Map<string, number>();
      for (const o of outs) tally.set(o, (tally.get(o) ?? 0) + 1);
      let best = outs[0];
      let bestN = 0;
      for (const [o, n] of tally) if (n > bestN) ((bestN = n), (best = o));
      return { mode, output: `Consensus:\n${best}`, steps };
    }
    case 'debate': {
      let a = await call(members[0], prompt);
      steps.push({ member: members[0].id, role: 'debater-a', output: a });
      for (let i = 1; i < 3; i++) {
        const b = await call(members[1 % members.length], `Respond to: ${a}`);
        steps.push({ member: members[1 % members.length].id, role: `debater-b@${i}`, output: b });
        a = (await call(members[0], `Rebut: ${b}`));
        steps.push({ member: members[0].id, role: `debater-a@${i}`, output: a });
      }
      return { mode, output: a, steps };
    }
    case 'synthesis': {
      const outs = await Promise.all(members.map((m) => call(m, prompt)));
      outs.forEach((o, i) => steps.push({ member: members[i].id, role: 'contributor', output: o }));
      const synth = await call(members[0], `Synthesize into one answer:\n${outs.join('\n---\n')}`);
      steps.push({ member: members[0].id, role: 'synthesizer', output: synth });
      return { mode, output: synth, steps };
    }
  }
}
