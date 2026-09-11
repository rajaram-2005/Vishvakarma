import { redirect } from 'next/navigation';

// Lumen Studio — the workspace opens on Chat: one chat, every model and capability.
export default function WorkspaceHome() {
  redirect('/workspace/chat');
}
