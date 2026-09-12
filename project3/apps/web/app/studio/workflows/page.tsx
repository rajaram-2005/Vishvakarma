'use client';

import { useEffect, useState } from 'react';
import { studioClient } from '@/lib/studio-client';

interface WFNode {
  id: string;
  name: string;
  dependsOn: string[];
}

export default function WorkflowBuilderPage() {
  const [nodes, setNodes] = useState<WFNode[]>([{ id: 'a', name: 'Step A', dependsOn: [] }]);
  const [name, setName] = useState('');
  const [result, setResult] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [ran, setRan] = useState(0);

  function addNode() {
    const id = `n${nodes.length + 1}`;
    setNodes([...nodes, { id, name: `Step ${id.toUpperCase()}`, dependsOn: [] }]);
  }
  function setDep(i: number, dep: string) {
    const next = [...nodes];
    next[i].dependsOn = dep ? [dep] : [];
    setNodes(next);
  }
  async function run() {
    const r = await studioClient.runCustomWorkflow(nodes);
    setResult(r.nodes as Array<{ id: string; name: string; status: string }>);
  }
  async function tick() {
    const r = await studioClient.tickSchedules();
    setRan(r.ran);
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Workflow Builder</h1>
      <p>Compose a workflow (nodes + dependencies) and run it through the ONE CORE.</p>
      <section style={{ marginBottom: 16 }}>
        {nodes.map((n, i) => (
          <div key={n.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ width: 90 }}>{n.id}</span>
            <input value={n.name} onChange={(e) => { const x = [...nodes]; x[i].name = e.target.value; setNodes(x); }} style={{ padding: 6 }} />
            <label>
              depends on{' '}
              <select value={n.dependsOn[0] ?? ''} onChange={(e) => setDep(i, e.target.value)}>
                <option value="">—</option>
                {nodes.filter((o) => o.id !== n.id).map((o) => <option key={o.id} value={o.id}>{o.id}</option>)}
              </select>
            </label>
          </div>
        ))}
        <button onClick={addNode} style={{ padding: 6, marginTop: 6 }}>Add node</button>{' '}
        <button onClick={run} style={{ padding: 6, marginLeft: 8 }}>Run workflow</button>{' '}
        <button onClick={tick} style={{ padding: 6, marginLeft: 8 }}>Tick schedules ({ran})</button>
      </section>
      <h2>Run result</h2>
      <pre>{result.length ? JSON.stringify(result, null, 2) : 'not run yet'}</pre>
    </main>
  );
}
