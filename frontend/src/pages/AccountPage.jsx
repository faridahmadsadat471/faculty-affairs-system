import { useSession } from '../context/SessionContext.jsx';
import { roleNames, date, initials } from '../utils/labels.js';
import Icon from '../components/Icon.jsx';

export default function AccountPage() {
  const { user } = useSession();
  return <>
    <div className="page-heading"><div><p className="section-eyebrow">د حساب معلومات</p><h1>زما حساب</h1><p>ستاسې هویت او د سیستم د لاسرسي دنده</p></div></div>
    <section className="content-card account-card"><div className="account-intro"><span className="person-avatar large" aria-hidden="true">{initials(user.fullName)}</span><div><h2>{user.fullName}</h2><p>{roleNames[user.role] || user.role}</p></div><Icon name="shield" size={28} /></div>
      <dl className="detail-grid"><div><dt>برېښنالیک</dt><dd><bdi>{user.email}</bdi></dd></div><div><dt>دنده</dt><dd>{roleNames[user.role] || user.role}</dd></div><div><dt>د حساب حالت</dt><dd>{user.isActive ? 'فعال' : 'غیرفعال'}</dd></div><div><dt>د حساب د جوړېدو نېټه</dt><dd>{date(user.createdAt)}</dd></div></dl>
      <p className="account-help">د نوم، برېښنالیک یا د لاسرسي دندې د بدلون لپاره د سیستم له مسؤول سره اړیکه ونیسئ.</p>
    </section>
  </>;
}
