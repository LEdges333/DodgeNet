// Interface localization (i18next + react-i18next).
// Note: the fi and hy translations were machine-generated and should be reviewed by a native speaker.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import ar from './locales/ar.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fi from './locales/fi.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import hy from './locales/hy.json';
import ja from './locales/ja.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import zh from './locales/zh.json';

const LANG_KEY = 'app-language';

// Чтобы добавить язык: положите <code>.json в ./locales и добавьте его сюда и в resources ниже
export const LANGUAGES = [
  { code: 'ar', name: 'العربية' },
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' }, 
  { code: 'es', name: 'Español' },
  { code: 'fi', name: 'Suomi' },
  { code: 'fr', name: 'Français' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'hy', name: 'Հայերեն' },
  { code: 'ja', name: '日本語' },
  { code: 'pt', name: 'Português' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh', name: '简体中文' },
];

const supported = LANGUAGES.map((l) => l.code);

// В вебе localStorage синхронный, поэтому язык можно определить до инициализации
// (без мигания интерфейса на языке по умолчанию)
function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && supported.includes(saved)) return saved;
  } catch {
    // localStorage может быть недоступен (приватный режим и т.п.)
  }
  const browserLang = (navigator.language || 'en').slice(0, 2);
  return supported.includes(browserLang) ? browserLang : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    de: { translation: de },
    en: { translation: en },
    es: { translation: es },
    fi: { translation: fi },
    fr: { translation: fr },
    hy: { translation: hy },
    ja: { translation: ja },
    pt: { translation: pt },
    ru: { translation: ru },
    zh: { translation: zh },
  },
  lng: getInitialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React сам экранирует вывод
});

// Атрибут lang на <html>: нужен для скринридеров и правильных шрифтов/переносов
document.documentElement.lang = i18n.language;
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export const setLanguage = async (code) => {
  if (!supported.includes(code)) return;
  await i18n.changeLanguage(code);
  try {
    localStorage.setItem(LANG_KEY, code);
  } catch {
    // не критично: язык просто не запомнится
  }
};

export default i18n;
