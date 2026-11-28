import { useEffect, useRef, useState } from 'react';
import { useSession } from '../context/SessionContext.jsx';
import { academicRanks, employmentStatuses, errorMessage } from '../utils/labels.js';
import { facultyFields, facultyPayload, facultyValues, validateFaculty } from '../utils/faculty-form.js';
import Icon from './Icon.jsx';

export default function FacultyForm({ original, onSaved }) {
  const { request } = useSession();
  const [values, setValues] = useState(() => facultyValues(original));
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState('');
  const pendingRef = useRef(false);
  const activeRef = useRef(true);
  useEffect(() => { activeRef.current = true; return () => { activeRef.current = false; }; }, []);
  const errorRef = useRef(null);
  const payload = facultyPayload(values, original);
  function change(event) {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  }
  function focusError(nextErrors) {
    const first = Object.keys(nextErrors)[0];
    requestAnimationFrame(() => {
      if (first) document.getElementById(`faculty-form-${first}`)?.focus();
      else errorRef.current?.focus();
    });
  }
  async function save(event) {
    event.preventDefault();
    if (pendingRef.current) return;
    const validation = validateFaculty(values);
    setErrors(validation); setFailure('');
    if (Object.keys(validation).length) { focusError(validation); return; }
    if (original && !Object.keys(payload).length) return;
    pendingRef.current = true; setPending(true);
    try {
      const data = await request(original ? `/faculty/${original._id}` : '/faculty', { method: original ? 'PATCH' : 'POST', body: payload });
      if (!data.faculty?._id) throw new Error('Invalid save response');
      if (activeRef.current) onSaved(data.faculty, Boolean(original));
    } catch (error) {
      if (!activeRef.current) return;
      const fieldErrors = {};
      for (const issue of error.errors || []) {
        if (facultyFields[issue.field]) fieldErrors[issue.field] = `د ${facultyFields[issue.field]} ارزښت بیا وګورئ.`;
      }
      setErrors(fieldErrors);
      if (error.status === 409 && error.message.includes('employee ID')) {
        fieldErrors.employeeId = 'په دې شمېره مخکې استاد ثبت شوی دی. بله ځانګړې شمېره وکاروئ.';
        setErrors({ ...fieldErrors }); setFailure('ریکارډ ثبت نه شو. د کارکوونکي شمېره تکراري ده.');
      } else if (!error.status || error.status >= 500) {
        setFailure('د خوندي کولو پایله تایید نه شوه. له بیا هڅې مخکې لست وګورئ، څو ریکارډ تکراري نه شي.');
      } else setFailure(errorMessage(error));
      focusError(fieldErrors);
    } finally { pendingRef.current = false; if (activeRef.current) setPending(false); }
  }
  const inputProps = (field) => ({ id: `faculty-form-${field}`, name: field, value: values[field], onChange: change, 'aria-invalid': Boolean(errors[field]), 'aria-describedby': errors[field] ? `faculty-error-${field}` : undefined });
  const fieldError = (field) => errors[field] && <p className="field-error" id={`faculty-error-${field}`}>{errors[field]}</p>;

  return <form className="faculty-edit-form" onSubmit={save} aria-busy={pending}>
    {failure && <div className="error-message" role="alert" tabIndex="-1" ref={errorRef}>{failure}</div>}
    <p className="form-required-note">د ستوري (*) لرونکې خانې حتمي دي.</p>
    <fieldset disabled={pending} className="faculty-form-fields">
      <legend className="sr-only">د استاد اصلي معلومات</legend>
      <div><label htmlFor="faculty-form-fullName">بشپړ نوم *</label><input {...inputProps('fullName')} required minLength={2} maxLength={100} autoComplete="off" />{fieldError('fullName')}</div>
      <div><label htmlFor="faculty-form-employeeId">د کارکوونکي شمېره *</label><input {...inputProps('employeeId')} required maxLength={50} autoComplete="off" dir="auto" />{fieldError('employeeId')}</div>
      <div><label htmlFor="faculty-form-department">څانګه *</label><input {...inputProps('department')} required maxLength={150} autoComplete="off" placeholder="د څانګې بشپړ نوم" />{fieldError('department')}</div>
      <div><label htmlFor="faculty-form-academicRank">علمي رتبه *</label><select {...inputProps('academicRank')} required><option value="">رتبه وټاکئ</option>{Object.entries(academicRanks).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{fieldError('academicRank')}</div>
      <div><label htmlFor="faculty-form-employmentStatus">د دندې حالت *</label><select {...inputProps('employmentStatus')} required>{Object.entries(employmentStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{fieldError('employmentStatus')}</div>
      <div><label htmlFor="faculty-form-email">برېښنالیک</label><input {...inputProps('email')} type="email" maxLength={254} autoComplete="off" dir="ltr" placeholder="name@example.com" />{fieldError('email')}</div>
      <div><label htmlFor="faculty-form-phone">د اړیکې شمېره</label><input {...inputProps('phone')} type="tel" maxLength={30} autoComplete="off" dir="ltr" />{fieldError('phone')}</div>
    </fieldset>
    <footer className="faculty-form-actions"><button className="primary-button" type="submit" disabled={pending || (Boolean(original) && !Object.keys(payload).length)}>{pending ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={18} />}{pending ? 'خوندي کېږي…' : original ? 'بدلونونه خوندي کول' : 'استاد ثبتول'}</button>{!pending && <a className="secondary-button" href="#/faculty">بېرته لست ته</a>}</footer>
  </form>;
}
