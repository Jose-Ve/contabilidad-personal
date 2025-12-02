import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient.js';
import { apiFetch } from '../services/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState(null);
  const lastProfileUserRef = useRef(null);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      if (!newSession) {
        lastProfileUserRef.current = null;
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!session) {
        setProfile(null);
        setError(null);
        setProfileLoading(false);
        lastProfileUserRef.current = null;
        return;
      }

      const currentUserId = session.user?.id ?? null;
      if (currentUserId && lastProfileUserRef.current === currentUserId) {
        return;
      }

      try {
        setProfileLoading(true);
        const data = await apiFetch('/me');
        setProfile(data);
        setError(null);
        lastProfileUserRef.current = currentUserId;
      } catch (err) {
        if (err?.response?.status === 401) {
          setError(null);
          setProfile(null);
          lastProfileUserRef.current = null;
        } else {
          console.error('Error obteniendo perfil', err);
          setError(err);
          setProfile(null);
          lastProfileUserRef.current = null;
        }
      } finally {
        setProfileLoading(false);
      }
    };

    void fetchProfile();
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      error,
      isAdmin: profile?.role === 'admin'
    }),
    [session, loading, profile, profileLoading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
