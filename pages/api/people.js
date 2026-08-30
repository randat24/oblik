import { withAuth, currentActor } from '../../lib/auth';
import { readPeople, findPerson, addPerson, updatePerson, ROLES } from '../../lib/people';
import { logChange } from '../../lib/log';

const clean = (v) => (v ?? '').toString().trim();

/** PIN має бути коротким, але не «1111» */
function badPin(pin) {
  const p = clean(pin);
  if (!/^\d{4,8}$/.test(p)) return 'PIN — від 4 до 8 цифр';
  if (/^(\d)\1+$/.test(p)) return 'PIN з однакових цифр надто простий';
  if ('0123456789'.includes(p) || '9876543210'.includes(p)) return 'PIN підряд надто простий';
  return null;
}

export default withAuth(async (req, res) => {
  if (req.method === 'GET') {
    // самі відбитки PIN назовні не віддаємо
    const people = (await readPeople()).map(({ hash, ...p }) => ({ ...p, hasPin: !!hash }));
    return res.json({ people, roles: ROLES });
  }

  if (req.method === 'POST') {
    const callsign = clean(req.body?.callsign);
    const pin = clean(req.body?.pin);
    const role = req.body?.role === 'admin' ? 'admin' : 'user';

    if (!callsign) return res.status(400).json({ error: 'Вкажіть позивний' });
    const pinErr = badPin(pin);
    if (pinErr) return res.status(400).json({ error: pinErr });

    const people = await readPeople();
    if (findPerson(people, callsign)) {
      return res.status(400).json({ error: `Позивний «${callsign}» уже є` });
    }

    await addPerson({ callsign, pin, role });
    await logChange({
      sheet: 'Люди', action: 'Додано людину', field: callsign, after: ROLES[role],
    });
    const updated = (await readPeople()).map(({ hash, ...p }) => ({ ...p, hasPin: !!hash }));
    return res.json({ people: updated });
  }

  if (req.method === 'PATCH') {
    const { row, pin, role, active } = req.body || {};
    const people = await readPeople();
    const person = people.find((p) => p.row === Number(row));
    if (!person) return res.status(404).json({ error: 'Людину не знайдено' });

    if (pin !== undefined) {
      const pinErr = badPin(pin);
      if (pinErr) return res.status(400).json({ error: pinErr });
    }
    // останнього адміністратора не можна лишити без доступу
    const admins = people.filter((p) => p.role === 'admin' && p.active);
    const losingAdmin = (role && role !== 'admin') || active === false;
    if (person.role === 'admin' && person.active && admins.length <= 1 && losingAdmin) {
      return res.status(400).json({ error: 'Це єдиний адміністратор — спершу призначте іншого' });
    }

    await updatePerson(person.row, { pin, role, active, callsign: person.callsign });
    const what = [
      pin ? 'новий PIN' : '',
      role ? ROLES[role] : '',
      active === undefined ? '' : active ? 'увімкнено' : 'вимкнено',
    ].filter(Boolean).join(', ');
    await logChange({
      sheet: 'Люди', row: person.row, action: 'Змінено доступ',
      field: person.callsign, after: what,
    });

    const updated = (await readPeople()).map(({ hash, ...p }) => ({ ...p, hasPin: !!hash }));
    return res.json({ people: updated });
  }

  res.status(405).json({ error: 'Method not allowed' });
}, { adminOnly: true });
