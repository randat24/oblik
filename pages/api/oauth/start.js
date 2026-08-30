import { withAuth } from '../../../lib/auth';
import { getOAuthClient, oauthConfigured, DRIVE_SCOPE } from '../../../lib/googleAuth';

export function redirectUri(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${proto}://${req.headers.host}/api/oauth/callback`;
}

// Крок 1 разової авторизації: ведемо користувача на згоду Google
export default withAuth(async (req, res) => {
  if (!oauthConfigured()) {
    return res.status(503).json({
      error: 'Не задані GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET. '
        + 'Створіть OAuth-клієнт у Google Cloud Console і додайте ці змінні.',
    });
  }

  const client = getOAuthClient(redirectUri(req));
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // потрібно, щоб Google точно віддав refresh-токен
    scope: [DRIVE_SCOPE],
  });
  res.redirect(302, url);
});
