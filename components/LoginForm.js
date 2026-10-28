import { useState } from 'react';
import { loginApi } from '../services/api';

export default function LoginForm({ onOk }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await loginApi.login(pw);
      onOk();
    } catch (e) {
      setErr('Невірний пароль');
    }
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <div className="login-box">
        <h1 style={{ fontSize: '1.1rem', marginBottom: 18 }}>Облік майна</h1>
        <label>Пароль</label>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          style={{ width: '100%' }}
          autoFocus
        />
        <button className="btn" style={{ width: '100%', marginTop: 16 }} onClick={submit} disabled={busy}>
          {busy ? '...' : 'Увійти'}
        </button>
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
