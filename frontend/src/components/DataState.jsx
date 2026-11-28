import Icon from './Icon.jsx';
import { errorMessage } from '../utils/labels.js';

export default function DataState({ loading, error, onRetry, empty, children }) {
  if (loading) return <div className="data-state" role="status"><span className="spinner" /><p>معلومات ترلاسه کېږي…</p></div>;
  if (error) return <div className="data-state data-error" role="alert"><Icon name="info" size={30} /><p>{errorMessage(error)}</p>{onRetry && <button className="secondary-button" onClick={onRetry} type="button">بیا هڅه</button>}</div>;
  if (empty) return <div className="data-state"><Icon name="file" size={30} /><p>{typeof empty === 'string' ? empty : 'تراوسه معلومات نشته.'}</p></div>;
  return children;
}
