import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { apiRequest } from '../services/api.js';

function loginErrorMessage(error) {
  if (error.status === 401) return 'برېښنالیک یا پاسورډ سم نه دی. بیا یې وګورئ.';
  if (error.status === 429) return 'د ننوتلو هڅې ډېرې شوې. لږ وروسته بیا هڅه وکړئ.';
  if (error.status === 400 || error.status === 422) return 'برېښنالیک او پاسورډ په سمه بڼه ولیکئ.';
  return 'اړیکه بشپړه نه شوه. د انټرنېټ او سرور حالت وګورئ او بیا هڅه وکړئ.';
}

export default function LoginPage({ onLogin, isActive = true, notice = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editableFields, setEditableFields] = useState({ email: false, password: false });
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const errorRef = useRef(null);
  const formRef = useRef(null);

  const clearCredentials = useCallback(() => {
    formRef.current?.reset();
    setEmail('');
    setPassword('');
    setEditableFields({ email: false, password: false });
    setShowPassword(false);
    setError('');
  }, []);

  useEffect(() => {
    clearCredentials();
    // Clear restored form values when returning through the browser's back/forward cache.
    const handlePageShow = (event) => {
      if (event.persisted) clearCredentials();
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, [clearCredentials]);

  function enableField(event) {
    const input = event.currentTarget;
    // Login autofill may ignore autocomplete="off"; allow editing when the user focuses a field.
    input.readOnly = false;
    setEditableFields((current) => ({ ...current, [input.name]: true }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    // Read-only inputs skip native validation, so unlock and validate both on submit.
    form.elements.namedItem('email').readOnly = false;
    form.elements.namedItem('password').readOnly = false;
    setEditableFields({ email: true, password: true });
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    setPending(true);
    setError('');
    try {
      const session = await apiRequest('/auth/login', {
        method: 'POST',
        body: { email: values.get('email').trim(), password: values.get('password') },
      });
      if (!session.accessToken || !session.user) throw new Error('Invalid login response');
      // Clear credentials before hiding the form; logout reveals this same empty form.
      clearCredentials();
      onLogin(session);
    } catch (failure) {
      setError(loginErrorMessage(failure));
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="login-panel" aria-labelledby="login-title" hidden={!isActive}>
      <div className="section-eyebrow flex items-center gap-2"><span /> د استادانو د چارو سیستم</div>
      <h2 id="login-title">ښه راغلاست!</h2>
      <p className="form-introduction">خپل حساب ته ننوځئ او خپلې اداري چارې تعقیب کړئ.</p>
      {notice && <p className="session-notice" role="status">{notice}</p>}
      <form ref={formRef} onSubmit={handleSubmit} aria-busy={pending} className="login-form" autoComplete="off">
        {error && <div id="login-error" className="error-message flex items-start gap-2" role="alert" tabIndex="-1" ref={errorRef}><Icon name="info" /><p>{error}</p></div>}
        <div className="form-field">
          <label htmlFor="email">برېښنالیک</label>
          <div className="input-wrap">
            <Icon name="mail" />
            <input id="email" name="email" type="email" autoComplete="off" readOnly={!editableFields.email} onFocus={enableField} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" dir="ltr" required maxLength={254} disabled={pending} aria-describedby={error ? 'login-error' : undefined} />
          </div>
        </div>
        <div className="form-field">
          <label htmlFor="password">پاسورډ</label>
          <div className="input-wrap password-wrap">
            <Icon name="lock" />
            <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="off" readOnly={!editableFields.password} onFocus={enableField} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="خپل پاسورډ ولیکئ" dir="auto" required disabled={pending} aria-describedby={error ? 'login-error' : undefined} />
            <button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'پاسورډ پټ کړئ' : 'پاسورډ ښکاره کړئ'} aria-pressed={showPassword} disabled={pending}><Icon name={showPassword ? 'eyeOff' : 'eye'} /></button>
          </div>
        </div>
        <button className="primary-button flex w-full items-center justify-center gap-2" type="submit" disabled={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="lock" size={18} />}
          {pending ? 'ننوتل روان دي…' : 'حساب ته ننوتل'}
        </button>
      </form>
      <details className="recovery-help">
        <summary>پاسورډ مو هېر شوی؟</summary>
        <p>د پوهنتون د سیستم له مسؤول سره اړیکه ونیسئ، څو ستاسو هویت تایید او د پاسورډ د بېرته جوړولو کوډ درکړي.</p>
      </details>
      <div className="access-note flex items-start gap-3">
        <span className="note-icon"><Icon name="shield" size={21} /></span>
        <div><h3>د پوهنتون د کارکوونکو لپاره</h3><p>د ننوتلو لپاره د ادارې له خوا درکړل شوی حساب وکاروئ. خپل پاسورډ له نورو سره مه شریکوئ.</p></div>
      </div>
    </section>
  );
}
