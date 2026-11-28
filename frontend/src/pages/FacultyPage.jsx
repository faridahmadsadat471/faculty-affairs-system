import { useEffect, useState } from 'react';
import useApiData from '../hooks/useApiData.js';
import DataState from '../components/DataState.jsx';
import FacultyTable from '../components/FacultyTable.jsx';
import Icon from '../components/Icon.jsx';
import { academicRanks, employmentStatuses, number } from '../utils/labels.js';
import { useSession } from '../context/SessionContext.jsx';
import { canManageFaculty, canArchiveFaculty } from '../utils/faculty-form.js';

const initialFilters = { search: '', department: '', academicRank: '', employmentStatus: '', limit: '10' };

export default function FacultyPage({ onViewFaculty, onArchive, refreshKey = 0 }) {
  const { user } = useSession();
  const canEdit = canManageFaculty(user.role);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState({ ...initialFilters, page: 1 });
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([name, value]) => { if (String(value).trim()) params.set(name, String(value).trim()); });
  const { data, loading, error, reload } = useApiData(`/faculty?${params}`, refreshKey);
  function changeDraft(event) { setDraft((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function search(event) { event.preventDefault(); setFilters({ ...draft, page: 1 }); }
  function resetFilters() { setDraft(initialFilters); setFilters({ ...initialFilters, page: 1 }); }
  const pagination = data?.pagination;
  const validPage = pagination ? Math.max(1, pagination.totalPages) : filters.page;
  const pageNeedsCorrection = Boolean(pagination && pagination.page > validPage);
  useEffect(() => {
    if (pageNeedsCorrection) setFilters((current) => ({ ...current, page: validPage }));
  }, [pageNeedsCorrection, validPage]);

  return <>
    <div className="page-heading"><div><p className="section-eyebrow">د علمي کادر سوابق</p><h1>د استادانو لست</h1><p>استاد ولټوئ، سوابق فلټر کړئ او بشپړ معلومات یې وګورئ.</p></div><div className="page-actions">{canEdit && <a className="primary-button" href="#/faculty/new"><Icon name="people" size={18} />نوی استاد</a>}<button className="secondary-button" type="button" onClick={reload} disabled={loading}><Icon name="refresh" size={18} />تازه کول</button></div></div>
    <section className="content-card filter-card" aria-label="د استادانو لټون او فلټرونه">
      <form onSubmit={search} className="faculty-filters">
        <div className="filter-search"><label htmlFor="faculty-search">د استاد لټون</label><div className="input-wrap"><Icon name="search" /><input id="faculty-search" name="search" type="search" value={draft.search} onChange={changeDraft} maxLength={100} placeholder="نوم، د کارکوونکي شمېره یا برېښنالیک" /></div></div>
        <div><label htmlFor="faculty-department">څانګه</label><input id="faculty-department" name="department" value={draft.department} onChange={changeDraft} maxLength={150} placeholder="د څانګې بشپړ نوم" /></div>
        <div><label htmlFor="faculty-rank">علمي رتبه</label><select id="faculty-rank" name="academicRank" value={draft.academicRank} onChange={changeDraft}><option value="">ټولې رتبې</option>{Object.entries(academicRanks).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label htmlFor="faculty-status">د دندې حالت</label><select id="faculty-status" name="employmentStatus" value={draft.employmentStatus} onChange={changeDraft}><option value="">ټول حالتونه</option>{Object.entries(employmentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div><label htmlFor="faculty-limit">په هره پاڼه کې</label><select id="faculty-limit" name="limit" value={draft.limit} onChange={changeDraft}>{[10, 20, 50].map((value) => <option key={value} value={value}>{number(value)}</option>)}</select></div>
        <div className="filter-actions"><button className="primary-button" type="submit"><Icon name="search" size={18} />لټون</button><button className="secondary-button" type="button" onClick={resetFilters}>پاکول</button></div>
      </form>
    </section>
    <section className="content-card"><div className="card-heading"><div><h2>د لټون پایلې</h2><p>معلومات ستاسې د حساب د اجازې له مخې ښودل کېږي.</p></div>{pagination && <span className="count-label">{number(pagination.total)} سوابق</span>}</div>
      <DataState loading={loading || pageNeedsCorrection} error={error} onRetry={reload} empty={data?.faculty.length === 0 && 'له دې لټون او فلټرونو سره سم استاد ونه موندل شو.'}>{data && <FacultyTable faculty={data.faculty} onView={onViewFaculty} canEdit={canEdit} canArchive={canArchiveFaculty(user.role)} onArchive={onArchive} />}</DataState>
      {pagination && !pageNeedsCorrection && <nav className="pagination" aria-label="د استادانو د لست پاڼې"><p>پاڼه {number(pagination.page)} له {number(pagination.totalPages || 1)} څخه</p><div><button className="secondary-button" type="button" disabled={loading || pagination.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>مخکینۍ پاڼه</button><button className="secondary-button" type="button" disabled={loading || pagination.page >= pagination.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>راتلونکې پاڼه</button></div></nav>}
    </section>
  </>;
}
