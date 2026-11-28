import { useEffect, useRef, useState } from 'react';
import { SessionProvider, useSession } from '../context/SessionContext.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';
import FacultyPage from '../pages/FacultyPage.jsx';
import AccountPage from '../pages/AccountPage.jsx';
import FacultyEditorPage from '../pages/FacultyEditorPage.jsx';
import FacultyDetails from './FacultyDetails.jsx';
import FacultyArchiveDialog from './FacultyArchiveDialog.jsx';
import { canArchiveFaculty } from '../utils/faculty-form.js';
import Icon from './Icon.jsx';
import { date, initials, roleNames, errorMessage } from '../utils/labels.js';

const navigation = [
  { id: 'dashboard', label: 'عمومي کتنه', icon: 'dashboard' },
  { id: 'faculty', label: 'د استادانو سوابق', icon: 'people' },
  { id: 'account', label: 'زما حساب', icon: 'user' },
];
function routeFromHash() { return window.location.hash.startsWith('#/') ? window.location.hash.slice(2) || 'dashboard' : 'dashboard'; }

function ManagementLayout({ onSessionEnd }) {
  const { user, request } = useSession();
  const [route, setRoute] = useState(routeFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [archiveCandidate, setArchiveCandidate] = useState(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const headingRef = useRef(null);
  useEffect(() => {
    function navigate() { const next = routeFromHash(); setRoute(next); if (next !== 'faculty') setSaveNotice(''); setMenuOpen(false); setSelectedFaculty(null); setArchiveCandidate(null); }
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [route]);
  async function logout() {
    if (logoutPending) return;
    setLogoutPending(true); setLogoutError('');
    try { await request('/auth/logout', { method: 'POST' }); onSessionEnd(); }
    catch (error) { if (error.status !== 401) setLogoutError(errorMessage(error)); }
    finally { setLogoutPending(false); }
  }
  const editId = /^faculty\/([a-f\d]{24})\/edit$/i.exec(route)?.[1];
  const activeSection = route === 'faculty/new' || editId ? 'faculty' : route;
  const current = navigation.find((item) => item.id === activeSection);
  function facultySaved(person, edited) {
    setSaveNotice(edited ? `د ${person.fullName} معلومات په بریالیتوب سره بدل شول.` : `${person.fullName} په بریالیتوب سره ثبت شو.`);
    window.location.hash = '#/faculty';
  }
  function confirmArchive(person) {
    if (!canArchiveFaculty(user.role)) return;
    setSelectedFaculty(null);
    setArchiveCandidate(person);
  }
  function facultyArchived(person) {
    setArchiveCandidate((current) => current?._id === person._id ? null : current);
    setSelectedFaculty((current) => current === person._id ? null : current);
    setDataRevision((current) => current + 1);
    setSaveNotice(`د ${person.fullName} سوابق آرشیف شول.`);
  }
  function refreshAfterArchive() { setArchiveCandidate(null); setSelectedFaculty(null); setDataRevision((current) => current + 1); }

  return <div className="management-shell">
    <a className="skip-link" href="#management-content" onClick={(event) => { event.preventDefault(); headingRef.current?.focus(); }}>اصلي برخې ته تلل</a>
    <aside className="management-sidebar">
      <a href="#/dashboard" className="sidebar-brand"><img src="/brand/bost.jpg" alt="د بوست پوهنتون لوګو" width="52" height="52" /><div><strong>بوست پوهنتون</strong><span>د استادانو د چارو ریاست</span></div></a>
      <button type="button" className="sidebar-menu-button" aria-controls="management-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'close' : 'menu'} /><span>د سیستم مینو</span></button>
      <nav id="management-navigation" className={`sidebar-navigation ${menuOpen ? 'is-open' : ''}`} aria-label="د مدیریت مینو"><p className="navigation-label">کاري برخې</p>{navigation.map((item) => <a key={item.id} href={`#/${item.id}`} aria-current={activeSection === item.id ? 'page' : undefined} onClick={() => setMenuOpen(false)}><Icon name={item.icon} /><span>{item.label}</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="sidebar-account"><span className="sidebar-avatar" aria-hidden="true">{initials(user.fullName)}</span><div><strong>{user.fullName}</strong><span>{roleNames[user.role] || user.role}</span></div></div><button className="logout-button" type="button" onClick={logout} disabled={logoutPending}><Icon name="logout" size={18} />{logoutPending ? 'وتل روان دي…' : 'له حسابه وتل'}</button><a className="sidebar-website" href="https://bost.edu.af/" target="_blank" rel="noreferrer"><Icon name="globe" size={16} />د پوهنتون وېبپاڼه</a></div>
    </aside>
    <div className="management-main"><header className="management-topbar"><div><span>د استادانو د چارو سیستم</span><span className="breadcrumb-separator" aria-hidden="true">/</span><strong>{current?.label || 'پاڼه ونه موندل شوه'}</strong></div><time dateTime={new Date().toISOString()}>{date(new Date())}</time></header>
      <main id="management-content" tabIndex="-1" ref={headingRef} className="management-content">
        {logoutError && <div role="alert" className="error-message">{logoutError}</div>}
        {saveNotice && ['faculty', 'dashboard'].includes(route) && <p className="success-notice" role="status">{saveNotice}</p>}
        {route === 'dashboard' ? <DashboardPage onViewFaculty={setSelectedFaculty} refreshKey={dataRevision} /> : route === 'faculty' ? <FacultyPage onViewFaculty={setSelectedFaculty} onArchive={confirmArchive} refreshKey={dataRevision} /> : route === 'faculty/new' || editId ? <FacultyEditorPage key={route} id={editId} onSaved={facultySaved} /> : route === 'account' ? <AccountPage /> : <section className="content-card not-found"><h1>دا پاڼه ونه موندل شوه</h1><a href="#/dashboard" className="secondary-button">عمومي کتنې ته تلل</a></section>}
      </main><footer className="management-footer">© {new Date().getFullYear()} بوست پوهنتون · د استادانو د چارو مدیریت سیستم</footer>
    </div>
    {selectedFaculty && <FacultyDetails key={selectedFaculty} id={selectedFaculty} onClose={() => setSelectedFaculty(null)} onArchive={confirmArchive} />}
    {archiveCandidate && <FacultyArchiveDialog key={archiveCandidate._id} person={archiveCandidate} onClose={() => setArchiveCandidate(null)} onArchived={facultyArchived} onRefresh={refreshAfterArchive} />}
  </div>;
}

export default function ManagementApp({ session, onSessionEnd }) {
  return <SessionProvider session={session} onSessionEnd={onSessionEnd}>{session.storageUnavailable && <p className="session-notice" role="status">براوزر د ناستې ساتلو اجازه نه ورکوي؛ له Refresh وروسته بیا ننوتل اړین دي.</p>}<ManagementLayout onSessionEnd={onSessionEnd} /></SessionProvider>;
}
