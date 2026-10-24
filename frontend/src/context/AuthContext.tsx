import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  registerClub: (data: any) => Promise<void>;
  acceptInvitation: (data: any) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const authRevision = useRef(0);

  const refreshUser = async () => {
    const revision = authRevision.current;
    try {
      if (api.getToken()) {
        const u = await api.getMe();
        if (revision === authRevision.current) setUser(u);
      } else {
        if (revision === authRevision.current) setUser(null);
      }
    } catch (err) {
      // Do not let an older startup request erase a newer login/registration.
      if (revision === authRevision.current) {
        api.setToken(null);
        setUser(null);
      }
    } finally {
      if (revision === authRevision.current) setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, pass: string) => {
    authRevision.current += 1;
    setLoading(true);
    try {
      const response = await api.login(email, pass);
      setUser(response.user);
    } catch (error) {
      api.setToken(null);
      setUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const registerClub = async (data: any) => {
    authRevision.current += 1;
    setLoading(true);
    try {
      const response = await api.registerClub(data);
      setUser(response.user);
    } catch (error) {
      api.setToken(null);
      setUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const acceptInvitation = async (data: any) => {
    authRevision.current += 1;
    setLoading(true);
    try {
      const response = await api.acceptClubInvitation(data);
      setUser(response.user);
    } catch (error) {
      api.setToken(null); setUser(null); throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authRevision.current += 1;
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, registerClub, acceptInvitation, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
