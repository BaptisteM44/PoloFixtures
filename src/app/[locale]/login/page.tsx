'use client';

import { useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { signIn } from 'next-auth/react';
import { Link } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

function LoginForm() {
  const t = useTranslations('auth');
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/';
  const resetDone = searchParams.get('reset') === '1';
  const [mode, setMode] = useState<'player' | 'admin'>('player');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitPlayer = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    const result = await signIn('player', { email, password, redirect: false });
    setLoading(false);
    if (result?.error) { setError(t('error_invalid_credentials')); return; }
    window.location.href = next;
  };

  const submitAdmin = async (e: React.FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true);
    const result = await signIn('access-code', { code, redirect: false });
    setLoading(false);
    if (result?.error) { setError(t('error_invalid_code')); return; }
    window.location.href = next;
  };

  return (
    <div className="login-page">
      <div style={{ width: '100%', maxWidth: 420 }}>
        <h1 style={{ marginBottom: 24 }}>{t('login_title')}</h1>

        {resetDone && (
          <div style={{ background: 'color-mix(in srgb, var(--teal) 12%, transparent)', border: '1px solid var(--teal)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 14 }}>
            {t('reset_success')}
          </div>
        )}

        {mode === 'player' ? (
          <form className="panel form" onSubmit={submitPlayer} style={{ display: 'grid', gap: 16 }}>
            <label className="field-row">
              {t('field_email')}
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('field_email_placeholder')} />
            </label>
            <label className="field-row">
              {t('field_password')}
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('field_password_placeholder')} />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? t('btn_login_loading') : t('btn_login')}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
              <span>{t('link_no_account')}{' '}
                <Link href="/register" style={{ color: 'var(--teal)', fontWeight: 700 }}>{t('link_create_account')}</Link>
              </span>
              <Link href="/forgot-password" style={{ color: 'var(--text-muted)' }}>{t('link_forgot_password')}</Link>
            </div>
          </form>
        ) : (
          <form className="panel form" onSubmit={submitAdmin} style={{ display: 'grid', gap: 16 }}>
            <label className="field-row">
              {t('field_admin_code')}
              <input type="password" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="ADMIN2025" />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
              {loading ? t('btn_login_loading') : t('btn_login')}
            </button>
          </form>
        )}

        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          {mode === 'player' ? (
            <button type="button" onClick={() => { setMode('admin'); setError(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
              {t('link_admin_access')}
            </button>
          ) : (
            <button type="button" onClick={() => { setMode('player'); setError(null); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
              {t('link_back_player')}
            </button>
          )}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
