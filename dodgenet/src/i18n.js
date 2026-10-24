// Interface localization (i18next + react-i18next).
// Note: the fi and hy translations were machine-generated and should be reviewed by a native speaker.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import ru from './locales/ru.json';
import fi from './locales/fi.json';
import hy from './locales/hy.json';

const LANG_KEY = 'app-language';

// Чтобы добавить язык: положите <code>.json в ./locales и добавьте его сюда и в resources ниже
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'ru', name: 'Русский' },
  { code: 'fi', name: 'Suomi' },
  { code: 'hy', name: 'Հայերեն' },
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
    en: { translation: en },
    ru: { translation: ru },
    fi: { translation: fi },
    hy: { translation: hy },
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
