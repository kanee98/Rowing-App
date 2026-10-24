import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { resolveDestination } from '../lib/navigation';

interface Destination { view: string; target?: number; revision: number; }
interface Navigation { destination: Destination; navigate: (action: string) => void; }
const Context = createContext<Navigation | null>(null);

export const NavigationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [destination, setDestination] = useState<Destination>({ view: '', revision: 0 });
  const resolve = (action: string) => resolveDestination(user?.role, action);
  const navigate = (action: string) => {
    const next = resolve(action);
    const hash = next.view + (next.target ? '/' + next.target : '');
    window.history.pushState(null, '', window.location.pathname + window.location.search + '#' + hash);
    setDestination((old) => ({ ...next, revision: old.revision + 1 }));
  };
  useEffect(() => {
    const sync = () => setDestination((old) => ({ ...resolve(window.location.hash), revision: old.revision + 1 }));
    sync();
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync); };
  }, [user?.id, user?.role]);
  return <Context.Provider value={{ destination, navigate }}>{children}</Context.Provider>;
};

export const useNavigation = () => {
  const context = useContext(Context);
  if (!context) throw new Error('NavigationProvider is required');
  return context;
};

export const useDashboardTab = <T extends string>(allowed: readonly T[], fallback: T): [T, (tab: T) => void] => {
  const { destination, navigate } = useNavigation();
  return [allowed.includes(destination.view as T) ? destination.view as T : fallback, navigate];
};

export const useNavigationScroll = (targetId?: string, ready = true) => {
  const { destination } = useNavigation();
  useEffect(() => {
    if (!ready || !targetId) return;
    const frame = requestAnimationFrame(() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [destination.revision, targetId, ready]);
};
