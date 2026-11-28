import { academicRanks, employmentStatuses, date, initials } from '../utils/labels.js';

export function EmploymentBadge({ value }) {
  return <span className={`employment-badge status-${value}`}>{employmentStatuses[value] || value || '—'}</span>;
}

export default function FacultyTable({ faculty, onView, canEdit = false, canArchive = false, onArchive }) {
  return (
    <div className="table-scroll" tabIndex="0" role="region" aria-label="د استادانو جدول">
      <table className="faculty-table">
        <caption className="sr-only">د استادانو سوابق او د هر استاد د تفصیل تڼۍ</caption>
        <thead><tr><th scope="col">استاد</th><th scope="col">د کارکوونکي شمېره</th><th scope="col">څانګه</th><th scope="col">علمي رتبه</th><th scope="col">د دندې حالت</th><th scope="col">د ثبت نېټه</th><th scope="col"><span className="sr-only">تفصیل</span></th></tr></thead>
        <tbody>{faculty.map((person) => <tr key={person._id}>
          <td><div className="faculty-identity"><span className="person-avatar" aria-hidden="true">{initials(person.fullName)}</span><div><button className="name-link" onClick={() => onView(person._id)} type="button">{person.fullName}</button>{person.email && <p className="table-email" dir="ltr">{person.email}</p>}</div></div></td>
          <td><bdi className="record-code">{person.employeeId}</bdi></td><td>{person.department}</td>
          <td>{academicRanks[person.academicRank] || person.academicRank}</td><td><EmploymentBadge value={person.employmentStatus} /></td>
          <td className="nowrap">{date(person.createdAt)}</td><td><div className="record-actions"><button className="table-detail-button" type="button" onClick={() => onView(person._id)} aria-label={`د ${person.fullName} تفصیل`}>تفصیل</button>{canEdit && <a className="table-detail-button" href={`#/faculty/${person._id}/edit`} aria-label={`د ${person.fullName} معلوماتو سمون`}>سمون</a>}{canArchive && onArchive && <button className="table-detail-button archive-link" type="button" onClick={() => onArchive(person)} aria-label={`د ${person.fullName} آرشیف کول`}>آرشیف</button>}</div></td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}
