import { useEffect, useState } from 'react';
import { apiRequest } from '../services/api.js';

export default function ApiStatus() {
  const [status, setStatus] = useState('checking');
  useEffect(() => {
    const controller = new AbortController();
    apiRequest('/health', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
      .then((data) => setStatus(data.status === 'ok' ? 'online' : 'offline'))
      .catch(() => { if (!controller.signal.aborted) setStatus('offline'); });
    return () => controller.abort();
  }, []);

  const labels = { checking: 'د سیستم اړیکه کتل کېږي', online: 'سیستم ته اړیکه فعاله ده', offline: 'له سرور سره اړیکه نشته' };
  return <p className={`api-status ${status} flex items-center gap-2`} role="status"><span className="status-dot" />{labels[status]}</p>;
}
