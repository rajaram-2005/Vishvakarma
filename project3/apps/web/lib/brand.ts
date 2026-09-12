// Lumen Studio — the single product identity.
// Every user-visible surface reads from here, so the brand is one source of truth.
export const BRAND = {
  name: 'Lumen',
  product: 'Lumen Studio',
  tagline: 'One Studio. Every Model.',
  sub: 'The unified AI studio — chat, create, build and automate with every model in one workspace.',
  nav: ['Chat', 'Studio', 'Coder', 'Library', 'Plugins', 'Schedules'],
} as const;

export const PERSONAS: Array<{ id: string; label: string; emoji: string; summary: string; plugins: string[]; collections: string[]; suggest: string }> = [
  { id: 'student', label: 'Student', emoji: '🎓', summary: 'Study assistant, notes, flashcards, exam prep and study schedules.', plugins: ['cat-rag-tuning', 'cat-study-deck-maker', 'cat-quiz-generator', 'cat-lesson-planner'], collections: ['College', 'Study Notes'], suggest: 'Create a study plan for my semester' },
  { id: 'engineer', label: 'Engineer', emoji: '⚙️', summary: 'Calculations, datasheets, circuit analysis, standards research and diagrams.', plugins: ['cat-sql-explorer', 'cat-diagrams-as-code', 'cat-pdf-extract', 'cat-terraform-lint'], collections: ['Engineering', 'Datasheets'], suggest: 'Analyze this circuit and explain the design' },
  { id: 'developer', label: 'Developer', emoji: '💻', summary: 'Coder, Git, terminals, code review, deployment and developer plugins.', plugins: ['cat-github-mcp', 'cat-sentry-mcp', 'cat-docker-registry-clean', 'cat-secret-scanner'], collections: ['Projects', 'Snippets'], suggest: 'Build a complete React application' },
  { id: 'researcher', label: 'Researcher', emoji: '🔬', summary: 'Web research, paper analysis, citations, RAG and scheduled research.', plugins: ['cat-arxiv-digest', 'cat-pubmed-scan', 'cat-web-search-agent', 'cat-citation-formatter'], collections: ['Research', 'Papers'], suggest: 'Study these PDFs and prepare a report' },
  { id: 'writer', label: 'Writer', emoji: '✍️', summary: 'Writing, editing, story development, long documents and publishing.', plugins: ['cat-markdown-lint', 'cat-changelog-writer', 'cat-doc-translator', 'cat-alt-text-writer'], collections: ['Writing', 'Drafts'], suggest: 'Help me outline a novel' },
  { id: 'business', label: 'Business', emoji: '📈', summary: 'Market research, reports, presentations, forecasts and automation.', plugins: ['cat-notion-sync', 'cat-email-digest', 'cat-invoice-generator', 'cat-currency-fx'], collections: ['Business', 'Reports'], suggest: 'Every Monday prepare my business report' },
  { id: 'designer', label: 'Designer', emoji: '🎨', summary: 'Image studio, branding, palettes and design systems.', plugins: ['cat-palette-extractor', 'cat-figma-frame-import', 'cat-contrast-auditor', 'cat-watermark-studio'], collections: ['Design', 'Assets'], suggest: 'Create a brand palette for a solar energy startup' },
  { id: 'creator', label: 'Creator', emoji: '🎬', summary: 'Image, video and audio studio, storyboards, thumbnails and social content.', plugins: ['cat-thumbnail-maker', 'cat-video-trimmer', 'cat-audio-transcriber', 'cat-content-planner'], collections: ['Content', 'Media'], suggest: 'Create a product advertisement' },
  { id: 'teacher', label: 'Teacher', emoji: '🏫', summary: 'Lesson plans, quizzes, grading aids and classroom materials.', plugins: ['cat-quiz-generator', 'cat-study-deck-maker', 'cat-lesson-planner', 'cat-doc-translator'], collections: ['Teaching', 'Lessons'], suggest: 'Prepare a lesson on semiconductors' },
  { id: 'data', label: 'Data', emoji: '📊', summary: 'Datasets, analysis, forecasting, dashboards and SQL.', plugins: ['cat-csv-studio', 'cat-data-profiler', 'cat-sql-explorer', 'cat-embedding-index'], collections: ['Data', 'Models'], suggest: 'Analyze this dataset and find trends' },
  { id: 'finance', label: 'Finance', emoji: '💹', summary: 'Forecasting, market data, ledgers and financial reports.', plugins: ['cat-expense-ledger', 'cat-stock-ticker', 'cat-currency-fx', 'cat-invoice-generator'], collections: ['Finance', 'Ledger'], suggest: 'Forecast next quarter revenue' },
  { id: 'legal', label: 'Legal', emoji: '⚖️', summary: 'Document review, clause analysis and contract summaries.', plugins: ['cat-pdf-extract', 'cat-docx-import', 'cat-license-checker', 'cat-citation-formatter'], collections: ['Legal', 'Contracts'], suggest: 'Summarize this contract' },
  { id: 'healthcare', label: 'Healthcare', emoji: '🩺', summary: 'Literature review, clinical summaries and study support.', plugins: ['cat-pubmed-scan', 'cat-pdf-extract', 'cat-citation-formatter', 'cat-web-search-agent'], collections: ['Clinical', 'Literature'], suggest: 'Review recent literature on this topic' },
  { id: 'architect', label: 'Architect', emoji: '🏛️', summary: 'Diagrams, references, documentation and presentation sets.', plugins: ['cat-diagrams-as-code', 'cat-figma-frame-import', 'cat-plantuml-render', 'cat-pdf-extract'], collections: ['Architecture', 'References'], suggest: 'Create a block diagram for this system' },
  { id: 'scientist', label: 'Scientist', emoji: '🧪', summary: 'Papers, simulations, figures and experimental notes.', plugins: ['cat-arxiv-digest', 'cat-data-profiler', 'cat-diagrams-as-code', 'cat-citation-formatter'], collections: ['Science', 'Experiments'], suggest: 'Design an experiment to test this hypothesis' },
  { id: 'founder', label: 'Founder', emoji: '🚀', summary: 'Pitch decks, market research, product specs and investor updates.', plugins: ['cat-notion-sync', 'cat-email-digest', 'cat-web-search-agent', 'cat-invoice-generator'], collections: ['Startup', 'Pitch'], suggest: 'Build a pitch deck outline' },
  { id: 'marketing', label: 'Marketing', emoji: '📣', summary: 'Campaigns, content, ads, SEO and brand voice.', plugins: ['cat-thumbnail-maker', 'cat-video-trimmer', 'cat-news-radar', 'cat-watermark-studio'], collections: ['Marketing', 'Campaigns'], suggest: 'Create a product advertisement' },
  { id: 'other', label: 'Other', emoji: '✨', summary: 'A general workspace with everything enabled.', plugins: [], collections: ['General'], suggest: 'What can you do?' },
];

export type PersonaId = (typeof PERSONAS)[number]['id'];
