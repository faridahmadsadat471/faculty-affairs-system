import { createContext, useCallback, useContext, useMemo } from 'react';
import { apiRequest } from '../services/api.js';

const SessionContext = createContext(null);
export function SessionProvider({ session, onSessionEnd, children }) {
  const request = useCallback(async (path, options = {}) => {
    try {
      return await apiRequest(path, { ...options, token: session.accessToken });
    } catch (error) {
      if (error.status === 401) onSessionEnd('ستاسې ناسته پای ته رسېدلې. بیا خپل حساب ته ننوځئ.');
      throw error;
    }
  }, [session.accessToken, onSessionEnd]);
  const value = useMemo(() => ({ user: session.user, request }), [session.user, request]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
