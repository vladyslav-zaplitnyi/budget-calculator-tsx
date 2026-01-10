# 🎨 Як змінити шрифт у проекті

Проект використовує **централізоване управління шрифтами** - зміни в 3 місцях, і шрифт зміниться всюди!

---

## 📋 Поточний шрифт

**Orbitron** - сучасний геометричний шрифт

---

## 🔄 Як змінити шрифт (3 кроки)

### Крок 1: Оновити Google Fonts посилання

**Файл:** `public/index.html` (рядки ~29-35)

```html
<!-- Змінити це посилання -->
<link href="https://fonts.googleapis.com/css2?family=НОВИЙ_ШРИФТ:wght@400..900&display=swap" rel="stylesheet" />
```

💡 Де взяти посилання: [Google Fonts](https://fonts.google.com/)

---

### Крок 2: Оновити CSS змінні

**Файл:** `src/index.css` (рядки ~10-12)

```css
/* ===== НАЛАШТУВАННЯ ШРИФТІВ - ЗМІНЮЙ ТУТ! ===== */
--font-primary: 'НОВИЙ_ШРИФТ', system-ui, -apple-system, sans-serif;
--font-headings: 'НОВИЙ_ШРИФТ', system-ui, sans-serif;
```

---

### Крок 3: Оновити Tailwind конфіг

**Файл:** `tailwind.config.js` (рядки ~9-10)

```javascript
// ===== НАЛАШТУВАННЯ ШРИФТІВ - ЗМІНЮЙ ТУТ! =====
sans: ['НОВИЙ_ШРИФТ', 'system-ui', '-apple-system', 'sans-serif'],
display: ['НОВИЙ_ШРИФТ', 'system-ui', 'sans-serif'],
```

---

## ✅ Приклад: Зміна на Roboto

### 1. Google Fonts (index.html)
```html
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap" rel="stylesheet" />
```

### 2. CSS змінні (index.css)
```css
--font-primary: 'Roboto', system-ui, -apple-system, sans-serif;
--font-headings: 'Roboto', system-ui, sans-serif;
```

### 3. Tailwind (tailwind.config.js)
```javascript
sans: ['Roboto', 'system-ui', '-apple-system', 'sans-serif'],
display: ['Roboto', 'system-ui', 'sans-serif'],
```

---

## 🎯 Популярні шрифти для спроби

| Шрифт | Стиль | Google Fonts Link |
|-------|-------|-------------------|
| **Inter** | Універсальний, сучасний | `family=Inter:wght@400;500;600;700;800;900` |
| **Roboto** | Чіткий, читабельний | `family=Roboto:wght@400;500;700;900` |
| **Poppins** | М'який, дружній | `family=Poppins:wght@400;500;600;700;800` |
| **Montserrat** | Елегантний | `family=Montserrat:wght@400;500;600;700;800` |
| **Open Sans** | Класичний | `family=Open+Sans:wght@400;500;600;700;800` |
| **Orbitron** | Футуристичний (поточний) | `family=Orbitron:wght@400..900` |

---

## ⚠️ Важливо!

- Після зміни потрібно **перезапустити dev server** (`npm start`)
- Імена шрифтів **чутливі до регістру** - пиши точно як в Google Fonts
- Fallback шрифти (`system-ui`, `-apple-system`, `sans-serif`) залишай для сумісності

---

## 🚀 Швидкий чеклист

- [ ] Оновив `public/index.html` - посилання на Google Fonts
- [ ] Оновив `src/index.css` - CSS змінні `--font-primary` і `--font-headings`
- [ ] Оновив `tailwind.config.js` - `sans` і `display` в `fontFamily`
- [ ] Перезапустив `npm start`
- [ ] Перевірив у браузері

---

**Готово!** Шрифт змінився у всьому додатку! 🎉



















