import { useEffect, useRef } from 'react';
import useApiData from '../hooks/useApiData.js';
import DataState from './DataState.jsx';
import Icon from './Icon.jsx';
import { EmploymentBadge } from './FacultyTable.jsx';
import { academicRanks, date, number } from '../utils/labels.js';
import { useSession } from '../context/SessionContext.jsx';
import { canManageFaculty, canArchiveFaculty } from '../utils/faculty-form.js';

export default function FacultyDetails({ id, onClose, onArchive }) {
  const { user } = useSession();
  const dialogRef = useRef(null);
  const { data, loading, error, reload } = useApiData(`/faculty/${encodeURIComponent(id)}`);
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    // Leave native Escape handling intact; cleanup must not close a new StrictMode dialog.
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const person = data?.faculty;
  return <dialog ref={dialogRef} className="faculty-dialog" aria-labelledby="faculty-detail-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="detail-header"><div><p className="section-eyebrow">د استاد سوابق</p><h2 id="faculty-detail-title">{person?.fullName || 'د استاد تفصیل'}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="د استاد معلومات تړل"><Icon name="close" /></button></header>
    <DataState loading={loading} error={error} onRetry={reload}>
      {person && <div className="detail-body">
        <div className="detail-identity"><bdi className="record-code">{person.employeeId}</bdi><EmploymentBadge value={person.employmentStatus} /></div>
        <dl className="detail-grid">
          <div><dt>څانګه</dt><dd>{person.department}</dd></div><div><dt>علمي رتبه</dt><dd>{academicRanks[person.academicRank] || person.academicRank}</dd></div>
          <div><dt>برېښنالیک</dt><dd><bdi>{person.email || '—'}</bdi></dd></div><div><dt>د اړیکې شمېره</dt><dd><bdi>{person.phone || '—'}</bdi></dd></div>
          <div><dt>د ثبت نېټه</dt><dd>{date(person.createdAt)}</dd></div><div><dt>وروستی بدلون</dt><dd>{date(person.updatedAt)}</dd></div>
          <div><dt>ثبت شوي اسناد</dt><dd>{number(person.documents?.length)}</dd></div>
        </dl>
        <h3 className="detail-section-title">زده کړې</h3>
        {person.education?.length ? <ul className="history-list">{person.education.map((item, index) => <li key={item._id || index}><strong>{item.degree}</strong><p>{item.institution}{item.fieldOfStudy ? ` · ${item.fieldOfStudy}` : ''}{item.graduationYear ? ` · ${number(item.graduationYear)}` : ''}</p></li>)}</ul> : <p className="muted-note">د زده کړو معلومات نه دي ثبت شوي.</p>}
        <h3 className="detail-section-title">کاري سابقه</h3>
        {person.employmentHistory?.length ? <ul className="history-list">{person.employmentHistory.map((item, index) => <li key={item._id || index}><strong>{item.position}</strong><p>{item.organization}</p><p>{date(item.startDate)} — {item.endDate ? date(item.endDate) : 'تر اوسه'}</p></li>)}</ul> : <p className="muted-note">کاري سابقه نه ده ثبت شوې.</p>}
      </div>}
    </DataState>
    <footer className="detail-footer detail-action-row">{person && canArchiveFaculty(user.role) && onArchive && <button type="button" className="secondary-button archive-link" onClick={() => onArchive(person)}>آرشیف کول</button>}{person && canManageFaculty(user.role) && <a className="secondary-button" href={`#/faculty/${person._id}/edit`} onClick={onClose}>معلومات سمول</a>}<button type="button" className="secondary-button" onClick={onClose}>تړل</button></footer>
  </dialog>;
}
