import i18n from '../i18n';

// The backend answers errors as {"code": "user_not_found", "message": "<English text>"}
// (see api_error() in backend/app.py). The code is mapped to the translation key
// `serverErrors.<code>` in src/locales/*.json.
//
// Fallbacks, in order:
//   1. unknown code (no translation yet)  -> the English `message` from the server
//   2. no response at all (network down)  -> the translated `fallbackKey`
export function errorMessage(error, fallbackKey) {
  const data = error.response?.data;

  if (data?.code && i18n.exists(`serverErrors.${data.code}`)) {
    return i18n.t(`serverErrors.${data.code}`);
  }
  return data?.message || i18n.t(fallbackKey);
}
