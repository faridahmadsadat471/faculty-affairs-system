import { useCallback, useEffect, useState } from 'react';
import UniversityHeader from './components/UniversityHeader.jsx';
import BrandPanel from './components/BrandPanel.jsx';
import ApiStatus from './components/ApiStatus.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ManagementApp from './components/ManagementApp.jsx';
import DataState from './components/DataState.jsx';
import { apiRequest } from './services/api.js';
import { clearStoredSession, readStoredSession, sessionRecord, storeSession } from './services/session-store.js';
import './styles/management.css';

export default function App() {
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState('');
  const [restoration, setRestoration] = useState(() => ({ checking: Boolean(readStoredSession()), error: null }));
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const endSession = useCallback((message = '') => {
    clearStoredSession();
    setSession(null);
    setRestoration({ checking: false, error: null });
    setNotice(message);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  useEffect(() => {
    const stored = readStoredSession();
    if (!stored) { setRestoration({ checking: false, error: null }); return; }
    const controller = new AbortController();
    setRestoration({ checking: true, error: null });
    apiRequest('/auth/me', { token: stored.accessToken, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) })
      .then(({ user }) => {
        if (controller.signal.aborted) return;
        if (!user?.id || !user.isActive) throw new Error('Invalid account response');
        // The server supplies the current identity and role; cached role values are never trusted.
        setSession({ ...stored, user });
        setRestoration({ checking: false, error: null });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401) endSession('ستاسې ناسته پای ته رسېدلې. بیا خپل حساب ته ننوځئ.');
        else setRestoration({ checking: false, error });
      });
    return () => controller.abort();
  }, [restoreAttempt, endSession]);
  function login(nextSession) {
    const stored = sessionRecord(nextSession);
    const persisted = storeSession(stored);
    setNotice('');
    setSession({ ...stored, user: nextSession.user, storageUnavailable: !persisted });
  }
  const restoring = restoration.checking || Boolean(restoration.error);
  return (
    <>
    <div className="app-shell" hidden={Boolean(session) || restoring}>
      <a className="skip-link" href="#main-content">اصلي برخې ته تلل</a>
      <UniversityHeader />
      <main id="main-content" className="auth-layout">
        <BrandPanel />
        <LoginPage onLogin={login} isActive={!session && !restoring} notice={notice} />
      </main>
      <footer className="page-footer flex flex-wrap items-center justify-between gap-3">
        <p>© {new Date().getFullYear()} بوست پوهنتون <span className="footer-divider" aria-hidden="true">|</span> د استادانو د چارو ریاست</p>
        <ApiStatus />
      </footer>
    </div>
    {restoring && <div className="app-shell"><UniversityHeader /><main className="session-restore"><h1>د ناستې تایید</h1><DataState loading={restoration.checking} error={restoration.error} onRetry={() => setRestoreAttempt((current) => current + 1)} /></main></div>}
    {session && <ManagementApp session={session} onSessionEnd={endSession} />}
    </>
  );
}
