import { withAuth } from '../../lib/auth';
import { readLog } from '../../lib/log';

export default withAuth(async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const limit = Math.min(Number(req.query.limit) || 300, 1000);
  res.json({ entries: await readLog(limit) });
});
