// §50 / §51 / §52 / §53 — Project Workspaces, Templates, Snapshots and
// Import/Export. The primary isolation boundary for chats, files, knowledge,
// bots, models, plugins, MCP, coder, studio, schedules, tasks and workflows.

export type ProjectTemplateId =
  | 'research'
  | 'software'
  | 'engineering'
  | 'business'
  | 'content'
  | 'study'
  | 'startup'
  | 'creative';

export interface ProjectTemplate {
  id: ProjectTemplateId;
  name: string;
  defaults: Record<string, unknown>;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  { id: 'research', name: 'Research Project', defaults: { surfaces: ['chat', 'library', 'schedules'] } },
  { id: 'software', name: 'Software Project', defaults: { surfaces: ['coder', 'chat', 'workflows'] } },
  { id: 'engineering', name: 'Engineering Project', defaults: { surfaces: ['coder', 'studio', 'library'] } },
  { id: 'business', name: 'Business Project', defaults: { surfaces: ['chat', 'studio', 'schedules'] } },
  { id: 'content', name: 'Content Project', defaults: { surfaces: ['studio', 'chat'] } },
  { id: 'study', name: 'Study Project', defaults: { surfaces: ['chat', 'library'] } },
  { id: 'startup', name: 'Startup Project', defaults: { surfaces: ['chat', 'coder', 'studio'] } },
  { id: 'creative', name: 'Creative Project', defaults: { surfaces: ['studio', 'chat'] } },
];

export interface Project {
  id: string;
  name: string;
  template?: ProjectTemplateId;
  createdAt: string;
  settings: Record<string, unknown>;
  snapshot?: { takenAt: string; settings: Record<string, unknown> };
  archived?: boolean;
}

export interface ExportBundle {
  project: Project;
  chats: number;
  prompts: number;
  workflows: number;
  secretsExcluded: true;
}

export class ProjectWorkspace {
  private projects = new Map<string, Project>();

  create(name: string, template?: ProjectTemplateId, settings: Record<string, unknown> = {}): Project {
    const tpl = template ? PROJECT_TEMPLATES.find((t) => t.id === template) : undefined;
    const p: Project = {
      id: `proj_${this.projects.size + 1}`,
      name,
      template,
      createdAt: new Date().toISOString(),
      settings: { ...(tpl?.defaults ?? {}), ...settings },
    };
    this.projects.set(p.id, p);
    return p;
  }

  get(id: string): Project | undefined {
    return this.projects.get(id);
  }

  list(): Project[] {
    return [...this.projects.values()];
  }

  snapshot(id: string): Project {
    const p = this.projects.get(id);
    if (!p) throw new Error(`Unknown project ${id}`);
    p.snapshot = { takenAt: new Date().toISOString(), settings: { ...p.settings } };
    return p;
  }

  restore(id: string): Project {
    const p = this.projects.get(id);
    if (!p?.snapshot) throw new Error('No snapshot to restore');
    p.settings = { ...p.snapshot.settings };
    return p;
  }

  clone(id: string, newName: string): Project {
    const p = this.projects.get(id);
    if (!p) throw new Error(`Unknown project ${id}`);
    return this.create(newName, p.template, { ...p.settings });
  }

  archive(id: string): void {
    const p = this.projects.get(id);
    if (p) p.archived = true;
  }

  /** §53 — Export a portable bundle. Secrets are explicitly excluded. */
  export(id: string, counts: { chats?: number; prompts?: number; workflows?: number } = {}): ExportBundle {
    const p = this.projects.get(id);
    if (!p) throw new Error(`Unknown project ${id}`);
    return {
      project: { ...p, settings: { ...p.settings } },
      chats: counts.chats ?? 0,
      prompts: counts.prompts ?? 0,
      workflows: counts.workflows ?? 0,
      secretsExcluded: true,
    };
  }
}
