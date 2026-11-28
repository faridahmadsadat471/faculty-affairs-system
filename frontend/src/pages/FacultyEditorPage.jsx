import { useSession } from '../context/SessionContext.jsx';
import useApiData from '../hooks/useApiData.js';
import DataState from '../components/DataState.jsx';
import FacultyForm from '../components/FacultyForm.jsx';
import { canManageFaculty } from '../utils/faculty-form.js';

function EditFaculty({ id, onSaved }) {
  const state = useApiData(`/faculty/${encodeURIComponent(id)}`);
  return <DataState loading={state.loading} error={state.error} onRetry={state.reload}>{state.data?.faculty && <FacultyForm original={state.data.faculty} onSaved={onSaved} />}</DataState>;
}
export default function FacultyEditorPage({ id, onSaved }) {
  const { user } = useSession();
  if (!canManageFaculty(user.role)) return <section className="content-card"><DataState error={{ status: 403 }} /><p className="editor-back-link"><a className="secondary-button" href="#/faculty">د استادانو لست</a></p></section>;
  return <>
    <div className="page-heading"><div><p className="section-eyebrow">د علمي کادر سوابق</p><h1>{id ? 'د استاد معلوماتو سمون' : 'د نوي استاد ثبت'}</h1><p>د استاد اصلي معلومات په دقت ولیکئ او خوندي یې کړئ.</p></div></div>
    <section className="content-card faculty-editor-card"><div className="card-heading"><div><h2>{id ? 'د ثبت شوو معلوماتو سمون' : 'د استاد پېژندنه او اړیکه'}</h2><p>د کارکوونکي شمېره باید ځانګړې وي.</p></div></div>{id ? <EditFaculty key={id} id={id} onSaved={onSaved} /> : <FacultyForm onSaved={onSaved} />}</section>
  </>;
}
