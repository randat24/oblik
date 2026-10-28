# Облік майна — сайт на Vercel

Next.js застосунок, який працює напряму з вашою Google Таблицею через Google Sheets API.
Без Apps Script, без банера Google, зі своїм доменом і захистом паролем.

---

## Крок 1. Сервісний акаунт Google (10 хв)

Це «робот», від імені якого сайт читатиме й писатиме у таблицю.

1. Відкрийте https://console.cloud.google.com/
2. Вгорі створіть новий проєкт (назва будь-яка, напр. `oblik-mayna`)
3. Меню → **APIs & Services → Library** → знайдіть **Google Sheets API** → **Enable**
4. Меню → **APIs & Services → Credentials** → **Create Credentials** → **Service account**
   - Ім'я: `oblik`
   - **Create and continue** → роль не потрібна → **Done**
5. Клацніть на створений акаунт → вкладка **Keys** → **Add key → Create new key → JSON** → завантажиться файл
6. Відкрийте цей JSON — звідти знадобляться два поля: `client_email` і `private_key`

## Крок 2. Дати роботу доступ до таблиці

1. Відкрийте вашу Google Таблицю
2. **Поділитися (Share)**
3. Вставте значення `client_email` з JSON (щось на кшталт `oblik@oblik-mayna.iam.gserviceaccount.com`)
4. Права: **Редактор**
5. Зніміть галочку «Сповістити» → **Поділитися**

## Крок 3. GitHub

```bash
cd oblik
git init
git add .
git commit -m "Облік майна"
git branch -M main
git remote add origin https://github.com/randat24/oblik.git
git push -u origin main
```

Репозиторій зробіть **приватним** — у коді немає паролів, але зайвого доступу краще уникати.

## Крок 4. Vercel

1. https://vercel.com → увійдіть через GitHub
2. **Add New → Project** → оберіть репозиторій `oblik` → **Import**
3. **Environment Variables** — додайте чотири змінні:

| Name | Value |
|---|---|
| `SPREADSHEET_ID` | `1E5k8fE2LnHO4PsSOT9RgtMZZNOfNYQ7Oj1ifO0gfIhY` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` з JSON |
| `GOOGLE_PRIVATE_KEY` | `private_key` з JSON — **повністю, разом з `-----BEGIN...`** |
| `APP_PASSWORD` | пароль для входу на сайт |
| `SESSION_SECRET` | будь-який довгий випадковий рядок |

> **Важливо про `GOOGLE_PRIVATE_KEY`:** копіюйте значення з JSON як є, разом із символами `\n`.
> Vercel приймає його в лапках. Код сам перетворює `\n` на переноси рядків.

4. **Deploy** → за хвилину сайт готовий

## Крок 5. Свій домен (за бажанням)

Project → **Settings → Domains** → додайте домен → пропишіть DNS-записи, які покаже Vercel.

---

## Оновлення

Будь-який `git push` у гілку `main` автоматично перезбирає й публікує сайт.

```bash
git add .
git commit -m "опис змін"
git push
```

---

## Налаштування листів

Файл `lib/sheets.js`, масив `SHEET_CONFIGS` — назви мають **точно** збігатися з ярличками вкладок:

```js
export const SHEET_CONFIGS = [
  { name: 'Радейки', kind: 'items' },
  { name: 'ПНВ', kind: 'items' },
  { name: 'Тепловізори', kind: 'items' },
  { name: 'Автомобільні', kind: 'items' },
  { name: 'Дрони', kind: 'items', noIssue: true },
  { name: 'Майно роти', kind: 'ledger' },
  { name: 'майно не облік', kind: 'items', maskPasswords: true },
  { name: 'Кропива', kind: 'items' },
  { name: 'Склад', kind: 'warehouse' },
];
```

- `kind: 'items'` — звичайний список карток
- `kind: 'ledger'` — відомість із залишками та списанням
- `kind: 'warehouse'` — склад із фото та QR
- `noIssue: true` — сховати кнопки «Видати / Прийняти»
- `maskPasswords: true` — приховати колонки з паролями

Колонки шукаються **за заголовками**, а не за номерами — можна переставляти місцями.

---

## Що працює

- **🔍 Пошук** — S/N, позивний, модель, місце, примітка. Групує: за номером / рахується за / інші згадки
- **Звичайні листи** — картки, фільтри за статусом, пошук, редагування на місці, «Видати» / «Прийняти» / «Видалити», додавання
- **Майно роти** — залишки, списання з датою, нові позиції
- **Склад** — унікальні коди, фільтр за пріоритетом, фото на весь екран, QR-код із друком

---

## Відмінності від версії на Apps Script

| | Apps Script | Vercel |
|---|---|---|
| Банер Google | є | немає |
| Швидкість | повільно | швидко |
| Свій домен | ні | так |
| Захист | доступ Google | пароль + сесія |
| Ліміти | квоти Apps Script | практично немає |

---

## Фото на складі

Зараз фото береться за посиланням із колонки «Фото» (нинішні посилання `lh3.googleusercontent.com` працюють).
Завантаження нових фото прямо з телефона в цій версії ще не зроблено — додається поле «Посилання на фото».

Якщо потрібне повноцінне завантаження — найкраще підключити Vercel Blob або Cloudinary
(у вас уже є конектор Cloudinary). Скажіть, і додам.

---

## Безпека

- Вхід за паролем (`APP_PASSWORD`), сесія на 30 днів у HttpOnly-cookie
- Ключ сервісного акаунта лежить у змінних оточення Vercel, у код не потрапляє
- Репозиторій тримайте приватним
- Якщо `APP_PASSWORD` не заданий — на Vercel вхід неможливий; локально (`npm run dev`) захист вимкнено
- Без `SESSION_SECRET` вхід теж неможливий

