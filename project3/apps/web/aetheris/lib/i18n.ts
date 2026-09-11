/**
 * Tiny client-side i18n: English, Tamil, Hindi. Language is picked from `aetheris.lang`
 * (Settings → General) or the browser, and `t(key)` returns the string. Missing keys fall back
 * to English so partial translations never break the UI.
 */
export type Lang = "en" | "ta" | "hi";
export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: "en", label: "English", native: "English" },
  { id: "ta", label: "Tamil", native: "தமிழ்" },
  { id: "hi", label: "Hindi", native: "हिन्दी" },
];

const en = {
  "mode.home": "Home", "mode.chat": "Chat", "mode.characters": "Characters", "mode.agents": "Agents", "mode.factory": "Coding Factory", "mode.studio": "Studio", "mode.apps": "Apps", "mode.providers": "Providers", "mode.gallery": "Gallery", "mode.workflows": "Workflows", "mode.learn": "Learn", "mode.study": "Study", "mode.docs": "Docs", "mode.schedules": "Schedules", "mode.control": "Control Center", "mode.ravana": "RAVANA",
  "sb.newChat": "New chat", "sb.search": "Search chats…", "sb.settings": "⚙ Settings, memory & keys", "sb.signOut": "sign out", "sb.projects": "Projects",
  "chat.placeholder": "Message Aetheris… (Shift+Enter for newline)", "chat.send": "Send", "chat.stop": "Stop", "chat.research": "Research", "chat.compare": "Compare", "chat.build": "Build",
  "chat.free": "free", "chat.today": "today", "chat.share": "Create a public read-only link to this chat", "chat.room": "Open a live room where others can join this chat", "chat.export": "Download this chat as Markdown",

  "room.notFound": "Room not found", "room.online": "online", "room.invite": "Invite", "room.copyLink": "Copy invite link", "room.empty": "Nobody has said anything yet. Share the link — everyone who opens it joins this room and the AI answers for all of you.", "room.yourName": "Your name", "room.placeholder": "Say something… Enter asks the AI, Alt+Enter is an aside to humans only", "room.aside": "aside", "room.asideTitle": "Post to humans only (AI stays quiet). Tip: start a message with // for the same effect.", "room.ask": "Ask",
  "gallery.title": "Prompt & agent gallery", "gallery.sub": "Community-shared prompts, agent recipes and workflows. Free, open, remixable.", "gallery.search": "Search the gallery…", "gallery.use": "Use", "gallery.publish": "Publish", "gallery.publishTitle": "Share a prompt or agent recipe", "gallery.name": "Title", "gallery.desc": "One-line description", "gallery.prompt": "Prompt / recipe (Markdown ok)", "gallery.agents": "Agents to @mention (comma-separated, optional)", "gallery.tags": "Tags (comma-separated)", "gallery.cancel": "Cancel", "gallery.submit": "Publish to gallery", "gallery.by": "by", "gallery.uses": "uses", "gallery.likes": "likes", "gallery.empty": "No entries yet — be the first to publish.", "gallery.all": "All", "gallery.mine": "Mine",
  "settings.language": "Language", "settings.languageHint": "Interface language. Answers follow the language you write in.",
};
export type Key = keyof typeof en;

const ta: Partial<Record<Key, string>> = {
  "mode.home": "முகப்பு", "mode.chat": "அரட்டை", "mode.characters": "பாத்திரங்கள்", "mode.agents": "ஏஜென்ட்கள்", "mode.factory": "கோடிங் தொழிற்சாலை", "mode.studio": "ஸ்டுடியோ", "mode.apps": "ஆப்ஸ்", "mode.providers": "வழங்குநர்கள்", "mode.gallery": "கேலரி", "mode.workflows": "பணிப்பாய்வுகள்", "mode.learn": "கற்றல்", "mode.study": "படிப்பு", "mode.docs": "ஆவணங்கள்", "mode.schedules": "அட்டவணைகள்", "mode.control": "கட்டுப்பாட்டு மையம்", "mode.ravana": "RAVANA",
  "sb.newChat": "புதிய அரட்டை", "sb.search": "அரட்டைகளைத் தேடு…", "sb.settings": "⚙ அமைப்புகள், நினைவகம் & கீகள்", "sb.signOut": "வெளியேறு", "sb.projects": "திட்டங்கள்",
  "chat.placeholder": "Aetheris-க்கு செய்தி அனுப்பு… (புதிய வரிக்கு Shift+Enter)", "chat.send": "அனுப்பு", "chat.stop": "நிறுத்து", "chat.research": "ஆராய்", "chat.compare": "ஒப்பிடு", "chat.build": "உருவாக்கு",
  "chat.free": "இலவசம்", "chat.today": "இன்று", "chat.share": "இந்த அரட்டைக்கு பொது இணைப்பு உருவாக்கு", "chat.room": "மற்றவர்கள் சேரக்கூடிய நேரடி அறையைத் திற", "chat.export": "இந்த அரட்டையை Markdown ஆக பதிவிறக்கு",

  "room.notFound": "அறை கிடைக்கவில்லை", "room.online": "ஆன்லைனில்", "room.invite": "அழை", "room.copyLink": "அழைப்பு இணைப்பை நகலெடு", "room.empty": "இன்னும் யாரும் பேசவில்லை. இணைப்பைப் பகிருங்கள் — திறப்பவர்கள் அனைவரும் இந்த அறையில் சேர்வார்கள், AI அனைவருக்கும் பதிலளிக்கும்.", "room.yourName": "உங்கள் பெயர்", "room.placeholder": "ஏதாவது சொல்லுங்கள்… Enter AI-யிடம் கேட்கும், Alt+Enter மனிதர்களுக்கு மட்டும்", "room.aside": "தனிப்பேச்சு", "room.asideTitle": "மனிதர்களுக்கு மட்டும் (AI அமைதியாக இருக்கும்). குறிப்பு: // உடன் தொடங்கினாலும் அதே பலன்.", "room.ask": "கேள்",
  "gallery.title": "ப்ராம்ப்ட் & ஏஜென்ட் கேலரி", "gallery.sub": "சமூகம் பகிர்ந்த ப்ராம்ப்ட்கள், ஏஜென்ட் செய்முறைகள், பணிப்பாய்வுகள். இலவசம், திறந்தது, மாற்றியமைக்கலாம்.", "gallery.search": "கேலரியில் தேடு…", "gallery.use": "பயன்படுத்து", "gallery.publish": "வெளியிடு", "gallery.publishTitle": "ப்ராம்ப்ட் அல்லது ஏஜென்ட் செய்முறையைப் பகிர்", "gallery.name": "தலைப்பு", "gallery.desc": "ஒரு வரி விளக்கம்", "gallery.prompt": "ப்ராம்ப்ட் / செய்முறை (Markdown ஆகலாம்)", "gallery.agents": "@குறிப்பிட வேண்டிய ஏஜென்ட்கள் (கமா பிரித்து, விருப்பம்)", "gallery.tags": "குறிச்சொற்கள் (கமா பிரித்து)", "gallery.cancel": "ரத்து", "gallery.submit": "கேலரியில் வெளியிடு", "gallery.by": "—", "gallery.uses": "பயன்பாடுகள்", "gallery.likes": "விருப்பங்கள்", "gallery.empty": "இன்னும் எதுவும் இல்லை — முதலில் வெளியிடுங்கள்.", "gallery.all": "அனைத்தும்", "gallery.mine": "என்னுடையது",
  "settings.language": "மொழி", "settings.languageHint": "இடைமுக மொழி. பதில்கள் நீங்கள் எழுதும் மொழியில் வரும்.",
};

const hi: Partial<Record<Key, string>> = {
  "mode.home": "होम", "mode.chat": "चैट", "mode.characters": "पात्र", "mode.agents": "एजेंट", "mode.factory": "कोडिंग फ़ैक्टरी", "mode.studio": "स्टूडियो", "mode.apps": "ऐप्स", "mode.providers": "प्रोवाइडर", "mode.gallery": "गैलरी", "mode.workflows": "वर्कफ़्लो", "mode.learn": "सीखें", "mode.study": "अध्ययन", "mode.docs": "दस्तावेज़", "mode.schedules": "शेड्यूल", "mode.control": "कंट्रोल सेंटर", "mode.ravana": "RAVANA",
  "sb.newChat": "नई चैट", "sb.search": "चैट खोजें…", "sb.settings": "⚙ सेटिंग्स, मेमोरी और कुंजियाँ", "sb.signOut": "साइन आउट", "sb.projects": "प्रोजेक्ट",
  "chat.placeholder": "Aetheris को संदेश भेजें… (नई पंक्ति के लिए Shift+Enter)", "chat.send": "भेजें", "chat.stop": "रोकें", "chat.research": "रिसर्च", "chat.compare": "तुलना", "chat.build": "बनाएँ",
  "chat.free": "मुफ़्त", "chat.today": "आज", "chat.share": "इस चैट का सार्वजनिक लिंक बनाएँ", "chat.room": "लाइव रूम खोलें जहाँ दूसरे इस चैट में शामिल हो सकें", "chat.export": "इस चैट को Markdown में डाउनलोड करें",

  "room.notFound": "रूम नहीं मिला", "room.online": "ऑनलाइन", "room.invite": "आमंत्रित करें", "room.copyLink": "आमंत्रण लिंक कॉपी करें", "room.empty": "अभी किसी ने कुछ नहीं कहा। लिंक साझा करें — जो भी खोलेगा वह इस रूम में जुड़ जाएगा और AI सबको जवाब देगा।", "room.yourName": "आपका नाम", "room.placeholder": "कुछ कहें… Enter से AI से पूछें, Alt+Enter सिर्फ़ लोगों के लिए", "room.aside": "सिर्फ़ लोगों को", "room.asideTitle": "केवल लोगों को भेजें (AI चुप रहेगा)। सुझाव: संदेश // से शुरू करें।", "room.ask": "पूछें",
  "gallery.title": "प्रॉम्प्ट और एजेंट गैलरी", "gallery.sub": "समुदाय द्वारा साझा प्रॉम्प्ट, एजेंट रेसिपी और वर्कफ़्लो। मुफ़्त, खुला, रीमिक्स योग्य।", "gallery.search": "गैलरी में खोजें…", "gallery.use": "उपयोग करें", "gallery.publish": "प्रकाशित करें", "gallery.publishTitle": "प्रॉम्प्ट या एजेंट रेसिपी साझा करें", "gallery.name": "शीर्षक", "gallery.desc": "एक पंक्ति का विवरण", "gallery.prompt": "प्रॉम्प्ट / रेसिपी (Markdown चलेगा)", "gallery.agents": "@mention करने वाले एजेंट (कॉमा से अलग, वैकल्पिक)", "gallery.tags": "टैग (कॉमा से अलग)", "gallery.cancel": "रद्द करें", "gallery.submit": "गैलरी में प्रकाशित करें", "gallery.by": "द्वारा", "gallery.uses": "उपयोग", "gallery.likes": "पसंद", "gallery.empty": "अभी कोई प्रविष्टि नहीं — सबसे पहले प्रकाशित करें।", "gallery.all": "सभी", "gallery.mine": "मेरे",
  "settings.language": "भाषा", "settings.languageHint": "इंटरफ़ेस की भाषा। जवाब उसी भाषा में आते हैं जिसमें आप लिखते हैं।",
};

const DICT: Record<Lang, Partial<Record<Key, string>>> = { en, ta, hi };
const KEY = "aetheris.lang";

export function getLang(): Lang {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(KEY) as Lang | null;
  if (saved && DICT[saved]) return saved;
  const nav = navigator.language.toLowerCase();
  return nav.startsWith("ta") ? "ta" : nav.startsWith("hi") ? "hi" : "en";
}
export function setLang(l: Lang) { if (typeof window !== "undefined") { localStorage.setItem(KEY, l); document.documentElement.lang = l; window.dispatchEvent(new Event("aetheris:lang")); } }
export function t(key: Key, lang: Lang = getLang()): string { return DICT[lang][key] ?? en[key] ?? key; }

/** React hook: re-renders on language change. */
import { useEffect, useState } from "react";
export function useLang() {
  const [lang, set] = useState<Lang>("en");
  useEffect(() => { set(getLang()); const h = () => set(getLang()); window.addEventListener("aetheris:lang", h); return () => window.removeEventListener("aetheris:lang", h); }, []);
  return { lang, setLang, t: (k: Key) => t(k, lang) };
}
