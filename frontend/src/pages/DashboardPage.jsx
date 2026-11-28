import useApiData from '../hooks/useApiData.js';
import { useSession } from '../context/SessionContext.jsx';
import DataState from '../components/DataState.jsx';
import FacultyTable from '../components/FacultyTable.jsx';
import Icon from '../components/Icon.jsx';
import { date, number, totalGroups, employmentStatuses } from '../utils/labels.js';

export default function DashboardPage({ onViewFaculty, refreshKey = 0 }) {
  const { user } = useSession();
  const summary = useApiData('/reports/summary', refreshKey);
  const recent = useApiData('/faculty?limit=5', refreshKey);
  const expiring = useApiData('/reports/contracts/expiring?days=30&limit=5', refreshKey);
  const data = summary.data;
  const metrics = data ? [
    { name: 'د استادانو سوابق', value: data.faculty.total, icon: 'people', note: 'ستاسې د لاسرسي په حدودو کې' },
    { name: 'د ترفیع غوښتنلیکونه', value: totalGroups(data.promotions), icon: 'award', note: `${number(data.promotions.find((row) => row.value === 'under_review')?.count)} تر ارزونې لاندې` },
    { name: 'قراردادونه', value: totalGroups(data.contracts.statuses), icon: 'file', note: `${number(data.contracts.expiringWithin30Days)} په ۳۰ ورځو کې پای ته رسېږي` },
    { name: 'علمي خپرونې', value: totalGroups(data.research.statuses), icon: 'book', note: `${number(data.research.statuses.find((row) => row.value === 'published')?.count)} خپرې شوې` },
  ] : [];
  function refreshAll() { summary.reload(); recent.reload(); expiring.reload(); }

  return <>
    <div className="page-heading"><div><p className="section-eyebrow">د چارو عمومي کتنه</p><h1>ښه راغلاست، {user.fullName}</h1><p>د استادانو او اړوندو اداري چارو وروستی حالت دلته وګورئ.</p></div><button className="secondary-button" type="button" onClick={refreshAll} disabled={summary.loading || recent.loading || expiring.loading}><Icon name="refresh" size={18} />معلومات تازه کول</button></div>
    <section className="scope-note"><Icon name="shield" size={18} /><p>دلته یوازې هغه معلومات ښکاري چې ستاسې حساب یې د لیدلو اجازه لري.</p></section>
    <DataState loading={summary.loading} error={summary.error} onRetry={summary.reload}>
      {data && <>
        <section className="metrics-grid" aria-label="د چارو شمېرې">{metrics.map((metric) => <article className="metric-card" key={metric.name}><div className="metric-top"><p>{metric.name}</p><span className="metric-icon"><Icon name={metric.icon} /></span></div><strong className="metric-value">{number(metric.value)}</strong><p className="metric-note">{metric.note}</p></article>)}</section>
        <div className="dashboard-columns">
          <section className="content-card"><div className="card-heading"><div><h2>د استادانو د دندې حالت</h2><p>د اوسنیو سوابقو وېش</p></div><Icon name="people" /></div>
            {data.faculty.total ? <div className="employment-bars">{Object.entries(employmentStatuses).map(([key, label]) => {
              const count = data.faculty.employment.find((row) => row.value === key)?.count || 0;
              return <div className="employment-row" key={key}><div><span>{label}</span><strong>{number(count)}</strong></div><progress max={data.faculty.total} value={count} aria-label={label} /></div>;
            })}</div> : <DataState empty="تراوسه د استادانو سوابق نشته." />}
          </section>
          <section className="content-card"><div className="card-heading"><div><h2>نور علمي او اداري معلومات</h2><p>د ثبت شوو معلوماتو لنډیز</p></div><Icon name="book" /></div>
            <dl className="summary-facts"><div><dt>ثبت شوې څانګې</dt><dd>{number(data.faculty.departments.length)}</dd></div><div><dt>جایزې او لاسته راوړنې</dt><dd>{number(totalGroups(data.awards))}</dd></div><div><dt>د تمدید رسېدلې یادونې</dt><dd>{number(data.contracts.remindersDue)}</dd></div><div><dt>د لنډیز نېټه</dt><dd>{date(data.generatedAt)}</dd></div></dl>
          </section>
        </div>
      </>}
    </DataState>
    <section className="content-card"><div className="card-heading"><div><h2>وروستي ثبت شوي استادان</h2><p>د ثبت د نېټې له مخې وروستي پنځه سوابق</p></div><a href="#/faculty" className="text-link">بشپړ لست</a></div>
      <DataState loading={recent.loading} error={recent.error} onRetry={recent.reload} empty={recent.data?.faculty.length === 0 && 'تراوسه د استادانو سوابق نشته.'}>{recent.data && <FacultyTable faculty={recent.data.faculty} onView={onViewFaculty} />}</DataState>
    </section>
    <section className="content-card"><div className="card-heading"><div><h2>پای ته نږدې قراردادونه</h2><p>منظور شوي قراردادونه چې په راتلونکو ۳۰ ورځو کې پای ته رسېږي</p></div><Icon name="clock" /></div>
      <DataState loading={expiring.loading} error={expiring.error} onRetry={expiring.reload} empty={expiring.data?.records.length === 0 && 'په دې موده کې پای ته رسېدونکی قرارداد نشته.'}>
        {expiring.data && <><ul className="contract-list">{expiring.data.records.map((contract) => <li key={contract._id}><span className="contract-symbol"><Icon name="file" /></span><div><strong>{contract.title}</strong><p><bdi>{contract.contractNumber}</bdi></p></div><div className="contract-end"><span>د پای نېټه</span><time dateTime={contract.endDate}>{date(contract.endDate)}</time></div></li>)}</ul>{expiring.data.pagination.total > 5 && <p className="card-footnote">د {number(expiring.data.pagination.total)} قراردادونو له ډلې لومړني {number(expiring.data.records.length)} ښودل شوي.</p>}</>}
      </DataState>
    </section>
  </>;
}
