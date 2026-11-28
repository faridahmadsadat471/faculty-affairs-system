import { useEffect, useRef, useState } from 'react';
import { useSession } from '../context/SessionContext.jsx';
import { canArchiveFaculty } from '../utils/faculty-form.js';
import Icon from './Icon.jsx';

export default function FacultyArchiveDialog({ person, onClose, onArchived, onRefresh }) {
  const { user, request } = useSession();
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const pendingRef = useRef(false);
  const activeRef = useRef(true);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);
  const errorRef = useRef(null);
  useEffect(() => {
    activeRef.current = true;
    const dialog = dialogRef.current;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => { activeRef.current = false; if (dialog.open) dialog.close(); };
  }, []);

  async function archive(event) {
    event.preventDefault();
    if (pendingRef.current || failure || !canArchiveFaculty(user.role)) return;
    pendingRef.current = true; setPending(true);
    try {
      const result = await request(`/faculty/${encodeURIComponent(person._id)}`, { method: 'DELETE' });
      if (result.id !== person._id) throw new Error('Archive response was not confirmed');
      // Refresh scoped data even if navigation removed this dialog while the request finished.
      onArchived(person);
    } catch (error) {
      if (!activeRef.current || error.status === 401) return;
      let message = 'د آرشیف پایله تایید نه شوه. له بیا هڅې مخکې لست تازه کړئ.';
      if (error.status === 403) message = 'د دې استاد د آرشیف کولو اجازه نه لرئ.';
      else if (error.status === 404) message = 'دا ریکارډ ونه موندل شو؛ ښايي مخکې آرشیف شوی وي. لست تازه کړئ.';
      setFailure({ message, refresh: error.status !== 403 });
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { pendingRef.current = false; if (activeRef.current) setPending(false); }
  }

  return <dialog ref={dialogRef} className="faculty-dialog archive-dialog" aria-labelledby="archive-title" aria-describedby="archive-description" onCancel={(event) => { event.preventDefault(); if (!pendingRef.current) onClose(); }}>
    <form onSubmit={archive} aria-busy={pending}>
      <header className="detail-header"><div className="archive-title"><span className="archive-symbol"><Icon name="archive" size={24} /></span><h2 id="archive-title">د استاد آرشیف کول</h2></div></header>
      <div className="detail-body">
        <p id="archive-description">آیا غواړئ د لاندې استاد سوابق آرشیف کړئ؟</p>
        <dl className="archive-person"><div><dt>بشپړ نوم</dt><dd>{person.fullName}</dd></div><div><dt>د کارکوونکي شمېره</dt><dd><bdi>{person.employeeId}</bdi></dd></div><div><dt>څانګه</dt><dd>{person.department}</dd></div></dl>
        <p className="archive-explanation">د استاد سوابق او اړوند علمي او اداري ریکارډونه به په عادي لستونو او راپورونو کې نه ښکاري. معلومات ساتل کېږي. که د کارن حساب ورسره تړلی وي، حساب یې نه غیرفعالېږي.</p>
        {failure && <div className="error-message" role="alert" ref={errorRef} tabIndex="-1">{failure.message}</div>}
      </div>
      <footer className="detail-footer archive-actions"><button type="button" ref={cancelRef} className="secondary-button" onClick={onClose} disabled={pending}>لغوه کول</button>{failure?.refresh && <button type="button" className="secondary-button" onClick={onRefresh}>لست تازه کول</button>}<button type="submit" className="archive-confirm-button" disabled={pending || Boolean(failure) || !canArchiveFaculty(user.role)}>{pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="archive" size={18} />}{pending ? 'آرشیف کېږي…' : 'هو، آرشیف یې کړه'}</button></footer>
    </form>
  </dialog>;
}
