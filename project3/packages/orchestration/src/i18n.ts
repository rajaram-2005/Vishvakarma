// §72 — Internationalization. An extensible localization system prepared for
// English, Tamil, Hindi, Spanish, French, German, Japanese, Korean, Chinese and
// Arabic. Untranslated keys fall back to English.

export type Locale = 'en' | 'ta' | 'hi' | 'es' | 'fr' | 'de' | 'ja' | 'ko' | 'zh' | 'ar';

const DICT: Record<Locale, Record<string, string>> = {
  en: { 'app.title': 'Unified AI Studio', 'action.run': 'Run', 'action.approve': 'Approve', 'state.completed': 'Completed' },
  ta: { 'app.title': 'ஐக்கிய AI ஸ்டுடியோ', 'action.run': 'இயக்கு', 'action.approve': 'ஒப்புதல்', 'state.completed': 'முடிந்தது' },
  hi: { 'app.title': 'यूनिफ़ाइड AI स्टूडियो', 'action.run': 'चलाएँ', 'action.approve': 'स्वीकारें', 'state.completed': 'पूर्ण' },
  es: { 'app.title': 'Estudio AI Unificado', 'action.run': 'Ejecutar', 'action.approve': 'Aprobar', 'state.completed': 'Completado' },
  fr: { 'app.title': 'Studio AI Unifié', 'action.run': 'Exécuter', 'action.approve': 'Approuver', 'state.completed': 'Terminé' },
  de: { 'app.title': 'Vereintes AI-Studio', 'action.run': 'Ausführen', 'action.approve': 'Genehmigen', 'state.completed': 'Abgeschlossen' },
  ja: { 'app.title': '統合AIスタジオ', 'action.run': '実行', 'action.approve': '承認', 'state.completed': '完了' },
  ko: { 'app.title': '통합 AI 스튜디오', 'action.run': '실행', 'action.approve': '승인', 'state.completed': '완료됨' },
  zh: { 'app.title': '统一AI工作室', 'action.run': '运行', 'action.approve': '批准', 'state.completed': '已完成' },
  ar: { 'app.title': 'استوديو الذكاء الاصطناعي الموحد', 'action.run': 'تشغيل', 'action.approve': 'موافقة', 'state.completed': 'مكتمل' },
};

export class I18n {
  constructor(private locale: Locale = 'en') {}

  setLocale(locale: Locale): void {
    this.locale = locale;
  }

  get localeInUse(): Locale {
    return this.locale;
  }

  t(key: string, vars?: Record<string, string | number>): string {
    const dict = DICT[this.locale] ?? DICT.en;
    let s = dict[key] ?? DICT.en[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    }
    return s;
  }

  static supported(): Locale[] {
    return Object.keys(DICT) as Locale[];
  }
}
