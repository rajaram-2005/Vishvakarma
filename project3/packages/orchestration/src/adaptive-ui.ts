// §115 / §116 / §117 / §118 / §119 — Unified Home, Adaptive UI, Power/Normal/
// Beginner/Expert modes. The UI prioritises the active package but never hides
// core capabilities permanently; advanced users can reveal everything.

export type UserProfile = 'student' | 'developer' | 'creator' | 'business';
export type UiMode = 'beginner' | 'normal' | 'power' | 'expert';

const HOME_BY_PROFILE: Record<UserProfile, string[]> = {
  student: ['ask', 'study', 'projects', 'recent-files'],
  developer: ['ask', 'coder', 'repositories', 'builds', 'issues'],
  creator: ['create', 'recent-assets', 'projects', 'studio', 'schedules'],
  business: ['ask', 'studio', 'dashboards', 'schedules', 'reports'],
};

const ALL_CAPABILITIES = [
  'models',
  'agents',
  'plugins',
  'mcp',
  'workflows',
  'api',
  'logs',
  'traces',
  'system-settings',
];

export interface UiAdaptation {
  profile: UserProfile;
  mode: UiMode;
  home: string[];
  visibleCapabilities: string[];
  hiddenCapabilities: string[];
}

export function adaptUi(profile: UserProfile, mode: UiMode): UiAdaptation {
  const home = HOME_BY_PROFILE[profile];
  if (mode === 'beginner') {
    return {
      profile,
      mode,
      home: ['ask', 'create', 'build', 'organize', 'automate'],
      visibleCapabilities: ['ask', 'create', 'build'],
      hiddenCapabilities: ALL_CAPABILITIES.filter((c) => !['ask', 'create', 'build'].includes(c)),
    };
  }
  if (mode === 'expert' || mode === 'power') {
    return { profile, mode, home, visibleCapabilities: ALL_CAPABILITIES, hiddenCapabilities: [] };
  }
  // normal: prioritise profile, keep core visible
  return {
    profile,
    mode,
    home,
    visibleCapabilities: [...new Set([...home, 'library', 'models', 'plugins', 'mcp', 'workflows'])],
    hiddenCapabilities: ALL_CAPABILITIES.filter((c) => !home.includes(c) && !['library', 'models', 'plugins', 'mcp', 'workflows'].includes(c)),
  };
}
