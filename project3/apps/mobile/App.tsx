// SUTRA Mobile — the AI control center.
// Phone-first: status, quick chat, approvals (the mobile superpower),
// security scanner, tasks. NOT a shrunken desktop.
import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { T } from './src/theme';
import { api } from './src/lib/api';

type Tab = 'home' | 'chat' | 'approvals' | 'security' | 'tasks';

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'home', label: 'Core', glyph: '◉' },
  { id: 'chat', label: 'Chat', glyph: '✦' },
  { id: 'approvals', label: 'Approvals', glyph: '✓' },
  { id: 'security', label: 'Guard', glyph: '⛨' },
  { id: 'tasks', label: 'Tasks', glyph: '☰' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.approvals('pending');
        if (alive) setPendingCount(r.approvals.length);
      } catch {
        if (alive) setPendingCount(0);
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [tab]);

  return (
    <SafeAreaProvider>
      <View style={[styles.root, { backgroundColor: T.bg }]}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <Text style={styles.wordmark}>SUTRA</Text>
          <Text style={styles.subtitle}>AI control center</Text>
        </View>
        <View style={{ flex: 1 }}>
          {tab === 'home' && <HomeScreen />}
          {tab === 'chat' && <ChatScreen />}
          {tab === 'approvals' && <ApprovalsScreen onResolved={() => setPendingCount((c) => c - 1)} />}
          {tab === 'security' && <SecurityScreen />}
          {tab === 'tasks' && <TasksScreen />}
        </View>
        <View style={styles.tabbar}>
          {TABS.map((t) => (
            <Pressable key={t.id} onPress={() => setTab(t.id)} style={styles.tab}>
              <View style={[styles.badge, (tab === t.id ? styles.badgeActive : null), t.id === 'approvals' && pendingCount > 0 ? styles.badgeAlert : null]}>
                <Text style={[styles.glyph, { color: tab === t.id ? T.cyan : T.dim }]}>{t.glyph}</Text>
              </View>
              {t.id === 'approvals' && pendingCount > 0 && <Text style={styles.pill}>{pendingCount}</Text>}
              <Text style={[styles.tabLabel, { color: tab === t.id ? T.text : T.dim }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

/* ---------------- Core (status) ---------------- */

function HomeScreen() {
  const [health, setHealth] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      const [h, m] = await Promise.all([api.health(), api.models()]);
      setHealth(h);
      setModels(m.models);
      setErr('');
    } catch (e: any) {
      setErr(`Cannot reach SUTRA API — check Settings → server URL (${e.message})`);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {err ? (
        <View style={[styles.card, { borderColor: T.danger + '55' }]}>
          <Text style={{ color: T.danger }}>{err}</Text>
        </View>
      ) : !health ? (
        <ActivityIndicator color={T.purple} />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>SYSTEM</Text>
            <Row k="mode" v={health.privacyMode} accent={health.privacyMode === 'local' ? T.cyan : T.warn} />
            <Row k="sync" v={health.syncScope} />
            <Row k="backends" v={health.backends.join(' · ') || 'none configured'} />
            <Row k="documents" v={String(health.documents)} />
            <Row k="tasks" v={String(health.tasks)} />
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>MODELS ({models.length})</Text>
            {models.map((m) => (
              <View key={m.id} style={styles.modelRow}>
                <Text style={{ color: T.text, flex: 1 }}>{m.name}</Text>
                <Text style={{ color: m.local ? T.ok : T.dim, fontSize: 11 }}>
                  {m.local ? 'LOCAL' : m.runtime}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ color: T.dim, fontSize: 12, padding: 16, lineHeight: 18 }}>
            The phone is the control surface: stream from any model, approve what your agents
            want to run, scan commands before they leave. The workspace itself lives on your
            machine.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

/* ---------------- Chat ---------------- */

function ChatScreen() {
  const [msgs, setMsgs] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [stream, setStream] = useState('');
  const [busy, setBusy] = useState(false);
  const [route, setRoute] = useState<any>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const next = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setBusy(true);
    setStream('');
    try {
      const d = await api.route(text, true);
      setRoute(d);
    } catch {
      /* routing best-effort */
    }
    let acc = '';
    try {
      for await (const piece of api.chat(next)) {
        acc += piece;
        setStream(acc);
      }
      setMsgs([...next, { role: 'assistant', content: acc || '(empty response)' }]);
    } catch (e: any) {
      setMsgs([...next, { role: 'assistant', content: `⚠ ${e.message}` }]);
    }
    setStream('');
    setBusy(false);
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={msgs}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        ListHeaderComponent={
          route ? (
            <Text style={{ color: T.dim, fontSize: 11 }}>
              route: {route.chosen?.name} — {route.analysis.label}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === 'user' ? { alignSelf: 'flex-end', borderColor: T.purple + '66' } : { borderColor: T.panelBorder },
            ]}
          >
            <Text style={{ color: T.text, fontSize: 14 }}>{item.content}</Text>
          </View>
        )}
      />
      {stream ? (
        <View style={[styles.bubble, { marginHorizontal: 16, borderColor: T.cyan + '55' }]}>
          <Text style={{ color: T.cyan, fontSize: 14 }}>{stream}</Text>
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Message SUTRA…"
          placeholderTextColor={T.dim}
          onSubmitEditing={send}
        />
        <Pressable onPress={send} disabled={busy} style={[styles.send, busy && { opacity: 0.5 }]}>
          <Text style={{ color: '#050510', fontWeight: '700' }}>{busy ? '…' : '➤'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- Approvals ---------------- */

function ApprovalsScreen({ onResolved }: { onResolved: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    try {
      setItems((await api.approvals()).approvals);
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, decision: 'once' | 'session' | 'deny' | 'inspect') => {
    try {
      await api.resolve(id, decision);
      onResolved();
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {err ? <Text style={{ color: T.danger, fontSize: 12 }}>{err}</Text> : null}
      {items.length === 0 && (
        <Text style={{ color: T.dim, padding: 16 }}>No approvals. Clean sheet — nothing is waiting on you.</Text>
      )}
      {items.map((a) => (
        <View key={a.id} style={[styles.card, { borderColor: (T.risk as any)[a.risk] + '55' }]}>
          <View style={styles.rowBetween}>
            <Text style={[styles.cardTitle, { color: (T.risk as any)[a.risk] || T.text, textTransform: 'uppercase' }]}>{a.risk}</Text>
            <Text style={{ color: T.dim, fontSize: 11 }}>{a.status}</Text>
          </View>
          <Text style={{ color: T.text, fontSize: 13, marginTop: 6, fontFamily: 'monospace' }}>{a.action}</Text>
          <Text style={{ color: T.dim, fontSize: 11, marginTop: 4 }}>{(a.reasons || []).join(' · ')}</Text>
          {a.status === 'pending' ? (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {(['once', 'session', 'inspect'] as const).map((d) => (
                <Pressable key={d} onPress={() => decide(a.id, d)} style={[styles.chip, { borderColor: T.ok + '77' }]}>
                  <Text style={{ color: T.ok, fontSize: 12 }}>{d === 'once' ? 'Allow once' : d === 'session' ? 'Allow session' : 'Inspect & allow'}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => decide(a.id, 'deny')} style={[styles.chip, { borderColor: T.danger + '77' }]}>
                <Text style={{ color: T.danger, fontSize: 12 }}>Deny</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={{ color: T.dim, fontSize: 11, marginTop: 10 }}>decided: {a.decision}</Text>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

/* ---------------- Security ---------------- */

function SecurityScreen() {
  const [cmd, setCmd] = useState('');
  const [risk, setRisk] = useState<{ risk: string; requiresApproval: boolean; reasons: string[] } | null>(null);
  const [secretText, setSecretText] = useState('');
  const [scan, setScan] = useState<{ findings: { line: number; kind: string }[]; clean: boolean } | null>(null);

  const assess = async () => {
    if (!cmd.trim()) return;
    try {
      setRisk(await api.assess('terminal.exec', cmd));
    } catch (e: any) {
      setRisk({ risk: 'error', requiresApproval: false, reasons: [e.message] });
    }
  };
  const doScan = async () => {
    if (!secretText.trim()) return;
    try {
      setScan(await api.scan(secretText));
    } catch (e: any) {
      setScan({ findings: [{ line: 0, kind: e.message }], clean: false });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.cardTitle}>COMMAND RISK</Text>
      <Text style={{ color: T.dim, fontSize: 12, marginBottom: 8 }}>Paste a command — SUTRA classifies it before it runs.</Text>
      <TextInput style={styles.input} value={cmd} onChangeText={setCmd} placeholder="git push origin main --force" placeholderTextColor={T.dim} multiline />
      <Pressable onPress={assess} style={[styles.chip, { alignSelf: 'flex-start', borderColor: T.purple + '77', marginTop: 10 }]}>
        <Text style={{ color: T.purple, fontSize: 12 }}>Assess</Text>
      </Pressable>
      {risk && (
        <View style={[styles.card, { borderColor: ((T.risk as any)[risk.risk] || T.danger) + '55' }]}>
          <Text style={{ color: (T.risk as any)[risk.risk] || T.danger, fontWeight: '700', textTransform: 'uppercase' }}>{risk.risk}</Text>
          <Text style={{ color: T.dim, fontSize: 12, marginTop: 4 }}>
            {risk.requiresApproval ? 'requires human approval' : 'auto-passes'} — {risk.reasons.join(' · ')}
          </Text>
        </View>
      )}
      <Text style={[styles.cardTitle, { marginTop: 20 }]}>SECRET SCAN</Text>
      <TextInput style={styles.input} value={secretText} onChangeText={setSecretText} placeholder="paste text to scan…" placeholderTextColor={T.dim} multiline />
      <Pressable onPress={doScan} style={[styles.chip, { alignSelf: 'flex-start', borderColor: T.cyan + '77', marginTop: 10 }]}>
        <Text style={{ color: T.cyan, fontSize: 12 }}>Scan</Text>
      </Pressable>
      {scan && (
        <View style={[styles.card, { borderColor: scan.clean ? T.ok + '55' : T.danger + '55' }]}>
          <Text style={{ color: scan.clean ? T.ok : T.danger }}>{scan.clean ? 'clean — no secret patterns' : `${scan.findings.length} finding(s)`}</Text>
          {scan.findings.map((f, i) => (
            <Text key={i} style={{ color: T.dim, fontSize: 12, marginTop: 4 }}>
              line {f.line}: {f.kind}
            </Text>
          ))}
          <Text style={{ color: T.dim, fontSize: 10, marginTop: 8 }}>values are never shown — location + kind only</Text>
        </View>
      )}
    </ScrollView>
  );
}

/* ---------------- Tasks ---------------- */

function TasksScreen() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [title, setTitle] = useState('');
  const load = useCallback(async () => {
    try {
      setTasks((await api.tasks()).tasks);
    } catch {
      /* offline */
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const add = async () => {
    if (!title.trim()) return;
    await api.createTask({ title: title.trim(), priority: 'p1' }).catch(() => {});
    setTitle('');
    load();
  };
  return (
    <View style={styles.screen}>
      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={{ color: T.text, fontSize: 13, flex: 1 }}>{item.title}</Text>
              <Text style={{ color: T.warn, fontSize: 11 }}>{item.priority}</Text>
            </View>
            {item.tags?.length ? (
              <Text style={{ color: T.dim, fontSize: 11, marginTop: 4 }}>{item.tags.join(' · ')}</Text>
            ) : null}
          </View>
        )}
      />
      <View style={styles.inputRow}>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Quick task…" placeholderTextColor={T.dim} onSubmitEditing={add} />
        <Pressable onPress={add} style={styles.send}>
          <Text style={{ color: '#050510', fontWeight: '700' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------------- shared bits ---------------- */

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <View style={styles.rowBetween}>
      <Text style={{ color: T.dim, fontSize: 12 }}>{k}</Text>
      <Text style={{ color: accent || T.text, fontSize: 12 }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10, flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  wordmark: { color: T.text, fontSize: 20, fontWeight: '800', letterSpacing: 6 },
  subtitle: { color: T.dim, fontSize: 12 },
  screen: { flex: 1, padding: 16, gap: 12 },
  card: { backgroundColor: T.panel, borderColor: T.panelBorder, borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  cardTitle: { color: T.cyan, fontSize: 11, letterSpacing: 2, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bubble: { backgroundColor: T.panel, borderColor: T.panelBorder, borderWidth: 1, borderRadius: 12, padding: 12, maxWidth: '86%' },
  inputRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: T.panelBorder },
  input: { flex: 1, backgroundColor: T.panel, borderColor: T.panelBorder, borderWidth: 1, borderRadius: 12, padding: 12, color: T.text, minHeight: 44 },
  send: { width: 48, height: 44, borderRadius: 12, backgroundColor: T.cyan, alignItems: 'center', justifyContent: 'center' },
  chip: { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  tabbar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: T.panelBorder, backgroundColor: 'rgba(8,7,22,0.9)', paddingBottom: 18, paddingTop: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 4, position: 'relative' },
  badge: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: T.panelBorder, alignItems: 'center', justifyContent: 'center' },
  badgeActive: { borderColor: T.cyan + '88', backgroundColor: T.cyan + '14' },
  badgeAlert: { borderColor: T.magenta + 'aa', backgroundColor: T.magenta + '22' },
  glyph: { fontSize: 14 },
  pill: { position: 'absolute', top: -4, right: '38%', backgroundColor: T.magenta, color: '#050510', fontSize: 10, fontWeight: '800', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabLabel: { fontSize: 10 },
});
