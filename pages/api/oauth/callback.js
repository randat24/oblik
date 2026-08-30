import { google } from 'googleapis';
import { withAuth } from '../../../lib/auth';
import { getOAuthClient, oauthConfigured } from '../../../lib/googleAuth';
import { PHOTO_FOLDER_NAME } from '../../../lib/drive';
import { redirectUri } from './start';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

function page(title, body) {
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { background:#12140f; color:#e8e6dc; font-family:system-ui,sans-serif;
         padding:24px; line-height:1.6; max-width:720px; margin:0 auto; }
  h1 { font-size:1.2rem; color:#d6a91f; letter-spacing:1px; text-transform:uppercase; }
  code, .val { font-family:ui-monospace,Consolas,monospace; }
  .val { display:block; background:#22261d; border:1px solid #33372c; color:#e8e6dc;
         padding:12px; border-radius:3px; margin:6px 0 18px; word-break:break-all;
         user-select:all; font-size:.9rem; }
  .name { color:#8d9280; font-size:.75rem; text-transform:uppercase; letter-spacing:.5px; }
  .err { color:#b7503f; }
  a { color:#d6a91f; }
</style></head><body>${body}</body></html>`;
}

// Крок 2: міняємо код на refresh-токен і одразу заводимо теку для фото
export default withAuth(async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!oauthConfigured()) {
    return res.status(503).send(page('Помилка',
      '<h1>Помилка</h1><p class="err">Не задані GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET.</p>'));
  }

  const { code, error } = req.query;
  if (error) {
    return res.status(400).send(page('Авторизацію скасовано',
      `<h1>Авторизацію скасовано</h1><p class="err">${esc(error)}</p>`));
  }
  if (!code) {
    return res.status(400).send(page('Немає коду',
      '<h1>Немає коду</h1><p class="err">Почніть з <code>/api/oauth/start</code>.</p>'));
  }

  try {
    const client = getOAuthClient(redirectUri(req));
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return res.status(400).send(page('Google не віддав refresh-токен', `
        <h1>Google не віддав refresh-токен</h1>
        <p>Таке буває, якщо доступ уже було надано раніше. Приберіть застосунок на
        <a href="https://myaccount.google.com/permissions" target="_blank">сторінці дозволів Google</a>
        і пройдіть авторизацію ще раз.</p>`));
    }

    // Тека має бути створена самим застосунком — зі scope drive.file
    // до створених вручну тек доступу немає
    client.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: client });
    const found = await drive.files.list({
      q: `mimeType='application/vnd.google-apps.folder' and name='${PHOTO_FOLDER_NAME}' and trashed=false`,
      fields: 'files(id,name)',
      spaces: 'drive',
    });
    const folder = found.data.files?.[0]
      || (await drive.files.create({
        requestBody: { name: PHOTO_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id',
      })).data;

    return res.status(200).send(page('Готово', `
      <h1>Готово</h1>
      <p>Додайте ці дві змінні у Vercel (Settings → Environment Variables),
      увімкніть їх для всіх середовищ і зробіть <b>Redeploy</b>.</p>

      <div class="name">GOOGLE_OAUTH_REFRESH_TOKEN</div>
      <div class="val">${esc(tokens.refresh_token)}</div>

      <div class="name">GOOGLE_DRIVE_FOLDER_ID</div>
      <div class="val">${esc(folder.id)}</div>

      <p>Теку «${esc(PHOTO_FOLDER_NAME)}» створено на вашому Диску — фото складатимуться саме туди.</p>
      <p><b>Змінну <code>GOOGLE_IMPERSONATE_USER</code> видаліть</b>, якщо вона ще залишилась:
      вона потрібна лише для Google Workspace і на звичайному акаунті ламає доступ.</p>
      <p>Токен показано один раз — скопіюйте його зараз.</p>`));
  } catch (err) {
    return res.status(500).send(page('Не вдалося', `
      <h1>Не вдалося отримати токен</h1>
      <p class="err">${esc(err.message || 'Невідома помилка')}</p>
      <p>Найчастіша причина — адреса перенаправлення не збігається з тією, що вказана
      в OAuth-клієнті. Має бути рівно: <code>${esc(redirectUri(req))}</code></p>`));
  }
});
