'use client';

import { useEffect, useState } from 'react';
import { studioClient, type StudioNode } from '@/lib/studio-client';

interface WFNode {
  id: string;
  name: string;
  dependsOn: string[];
}

export default function WorkflowBuilderPage() {
  const [nodes, setNodes] = useState<WFNode[]>([{ id: 'a', name: 'Step A', dependsOn: [] }]);
  const [name, setName] = useState('');
  const [result, setResult] = useState<StudioNode[]>([]);
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
    setResult(r.nodes);
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
      <h2>Run result (execution trace)</h2>
      {result.length ? (
        <ul>
          {result.map((n) => (
            <li key={n.id} style={{ marginBottom: 8 }}>
              <span
                style={{
                  display: 'inline-block',
                  minWidth: 90,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: n.status === 'completed' ? '#16351f' : n.status === 'failed' ? '#3a1d1d' : '#2a2f3a',
                  color: n.status === 'completed' ? '#7ee2a0' : n.status === 'failed' ? '#ff9b9b' : '#cdd6e0',
                  marginRight: 8,
                }}
              >
                {n.status}
              </span>
              <strong>{n.name}</strong>
              {n.result != null && <pre style={{ margin: '4px 0 0 98px', fontSize: 12, color: '#9fb3c8' }}>{String(n.result)}</pre>}
            </li>
          ))}
        </ul>
      ) : (
        'not run yet'
      )}
    </main>
  );
}
