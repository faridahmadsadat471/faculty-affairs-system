import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../context/SessionContext.jsx';

export default function useApiData(path, refreshKey = 0) {
  const { request } = useSession();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ path, revision, refreshKey, data: null, loading: true, error: null });
  const reload = useCallback(() => setRevision((current) => current + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState({ path, revision, refreshKey, data: null, loading: true, error: null });
    request(path, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then((data) => { if (!controller.signal.aborted) setState({ path, revision, refreshKey, data, loading: false, error: null }); })
      .catch((error) => { if (!controller.signal.aborted) setState({ path, revision, refreshKey, data: null, loading: false, error }); });
    return () => controller.abort();
  }, [path, revision, refreshKey, request]);
  // A changed filter must not briefly display the previous filter's results.
  if (state.path !== path || state.revision !== revision || state.refreshKey !== refreshKey) return { data: null, loading: true, error: null, reload };
  return { ...state, reload };
}
