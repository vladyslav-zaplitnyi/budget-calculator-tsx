# 🌍 Додавання нової мови

Щоб додати нову мову до проекту, виконайте наступні кроки:

## Крок 1: Створіть файл перекладів

Створіть новий файл `src/i18n/locales/[код_мови].json` (наприклад, `pl.json` для польської, `de.json` для німецької).

Скопіюйте структуру з `uk.json` або `en.json` та заповніть переклади:

```json
{
  "header": {
    "subtitle": "...",
    "title": "...",
    ...
  },
  ...
}
```

## Крок 2: Додайте мову в конфігурацію

Відкрийте `src/i18n/config.ts` та додайте нову мову в `resources`:

```typescript
import newLanguageTranslations from './locales/[код_мови].json';

// В методі .init():
resources: {
  uk: {
    translation: ukTranslations
  },
  en: {
    translation: enTranslations
  },
  [код_мови]: {  // Наприклад: pl, de, fr
    translation: newLanguageTranslations
  }
}
```

## Крок 3: Додайте перемикач мови (опціонально)

Якщо хочете додати перемикач мови в UI, відкрийте `src/components/Header.tsx` та додайте кнопку в перемикач мов (аналогічно до існуючих кнопок для UK та EN).

## Приклад: Додавання польської мови

1. Створіть `src/i18n/locales/pl.json` з перекладами
2. В `config.ts`:
   ```typescript
   import plTranslations from './locales/pl.json';
   
   resources: {
     // ... існуючі мови
     pl: {
       translation: plTranslations
     }
   }
   ```

Готово! Нова мова буде доступна через `i18n.changeLanguage('pl')`.

## ⚠️ Важливо

- Зберігайте **ідентичну структуру** ключів у всіх файлах перекладів
- TypeScript автоматично перевірить правильність ключів завдяки `src/types/i18next.d.ts`
- Якщо додаєте новий ключ, додайте його в **всі** файли перекладів

