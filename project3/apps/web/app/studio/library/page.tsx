'use client';

import { useEffect, useState } from 'react';
import { studioClient } from '@/lib/studio-client';

export default function LibraryPage() {
  const [list, setList] = useState<Array<{ id: string; title: string; text: string }>>([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  async function refresh() {
    setList(await studioClient.library());
  }
  useEffect(() => {
    refresh();
  }, []);

  async function save() {
    await studioClient.saveLibrary(title, text);
    setTitle('');
    setText('');
    await refresh();
  }

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui', color: '#e6edf3', background: '#0b0f1a', minHeight: '100vh' }}>
      <h1>Library</h1>
      <section style={{ marginBottom: 16 }}>
        <input placeholder="title" value={title} onChange={(e) => setTitle(e.target.value)} style={{ padding: 6, marginRight: 6 }} />
        <textarea placeholder="content" value={text} onChange={(e) => setText(e.target.value)} style={{ padding: 6, display: 'block', width: '60%', minHeight: 60 }} />
        <button onClick={save} style={{ padding: 6, marginTop: 6 }}>Save</button>
      </section>
      <ul>{list.map((a) => <li key={a.id}><strong>{a.title}</strong> — {a.text}</li>)}</ul>
    </main>
  );
}
