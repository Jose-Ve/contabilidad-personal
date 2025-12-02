import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient.js';
import './ResetPasswordPage.css';

const RECOVERY_EVENT = 'PASSWORD_RECOVERY';

function ResetPasswordPage() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors }
  } = useForm({
    defaultValues: {
      password: '',
      confirmPassword: ''
    }
  });
  const [phase, setPhase] = useState('checking'); // checking | ready | success | error
  const [feedback, setFeedback] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const recoveryTokens = useMemo(() => extractRecoveryTokens(), []);

  useEffect(() => {
    let active = true;

    const establishSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        cleanRecoveryHash();
        if (active) setPhase('ready');
        return;
      }

      if (!recoveryTokens) {
        if (active) {
          setPhase('error');
          setFeedback({
            variant: 'error',
            message: 'El enlace no es válido o ya fue utilizado. Solicita uno nuevo desde tu perfil.'
          });
        }
        return;
      }

      const { accessToken, refreshToken } = recoveryTokens;
      try {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) {
          throw error;
        }
        cleanRecoveryHash();
        if (active) setPhase('ready');
      } catch (error) {
        console.error('Error estableciendo sesión de recuperación', error);
        if (active) {
          setPhase('error');
          setFeedback({
            variant: 'error',
            message: error?.message ?? 'No pudimos validar el enlace. Solicita uno nuevo desde tu perfil.'
          });
        }
      }
    };

    void establishSession();

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return;
      if (event === RECOVERY_EVENT) {
        cleanRecoveryHash();
        setPhase('ready');
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [recoveryTokens]);

  const onSubmit = async (values) => {
    setSubmitting(true);
    setFeedback(null);

    try {
      const { data, error } = await supabase.auth.updateUser({ password: values.password });
      if (error) {
        throw error;
      }

      setPhase('success');
      setFeedback({
        variant: 'success',
        message: 'Tu contraseña se actualizó correctamente. Vamos a redirigirte al inicio de sesión.'
      });

      const updatedEmail = data?.user?.email ?? null;
      if (updatedEmail) {
        clearLoginLockState(updatedEmail);
      } else {
        clearAllLoginLockStates();
      }

      await supabase.auth.signOut();
      window.setTimeout(() => {
        navigate('/login', { replace: true });
      }, 3000);
    } catch (error) {
      console.error('Error actualizando contraseña', error);
      setFeedback({
        variant: 'error',
        message: error?.message ?? 'No pudimos actualizar tu contraseña. Intenta nuevamente.'
      });
      setSubmitting(false);
    }
  };

  if (phase === 'checking') {
    return (
      <main className="reset-page">
        <section className="reset-card">
          <h1>Validando enlace…</h1>
          <p>Estamos verificando que tu enlace de recuperación sea válido.</p>
        </section>
      </main>
    );
  }

  if (phase === 'error' && feedback) {
    return (
      <main className="reset-page">
        <section className="reset-card">
          <h1>Enlace no válido</h1>
          <p className={`reset-feedback reset-feedback--${feedback.variant}`}>{feedback.message}</p>
          <button type="button" className="reset-button" onClick={() => navigate('/login', { replace: true })}>
            Volver al inicio de sesión
          </button>
        </section>
      </main>
    );
  }

  if (phase === 'success' && feedback) {
    return (
      <main className="reset-page">
        <section className="reset-card">
          <h1>Contraseña actualizada</h1>
          <p className={`reset-feedback reset-feedback--${feedback.variant}`}>{feedback.message}</p>
          <button type="button" className="reset-button" onClick={() => navigate('/login', { replace: true })}>
            Ir a iniciar sesión
          </button>
        </section>
      </main>
    );
  }

  const passwordValue = watch('password');

  return (
    <main className="reset-page">
      <section className="reset-card">
        <header className="reset-card__header">
          <h1>Crea una nueva contraseña</h1>
          <p>El enlace que recibiste es válido por una sola vez. Define tu nueva contraseña y continúa con tu cuenta.</p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="reset-form">
          <label className="reset-field">
            <span>Nueva contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              {...register('password', {
                required: 'La contraseña es obligatoria',
                minLength: { value: 8, message: 'Debe tener al menos 8 caracteres' }
              })}
              className="reset-input"
              placeholder="••••••••"
              disabled={submitting}
            />
            {errors.password ? <small className="reset-error">{errors.password.message}</small> : null}
          </label>

          <label className="reset-field">
            <span>Confirma tu contraseña</span>
            <input
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword', {
                required: 'Confirma tu contraseña',
                validate: (value) => value === passwordValue || 'Las contraseñas no coinciden'
              })}
              className="reset-input"
              placeholder="••••••••"
              disabled={submitting}
            />
            {errors.confirmPassword ? <small className="reset-error">{errors.confirmPassword.message}</small> : null}
          </label>

          {feedback && feedback.variant === 'error' ? (
            <p className={`reset-feedback reset-feedback--${feedback.variant}`}>{feedback.message}</p>
          ) : null}

          <button type="submit" className="reset-button" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </section>
    </main>
  );
}

function extractRecoveryTokens() {
  if (typeof window === 'undefined') {
    return null;
  }

  const hash = window.location.hash ?? '';
  if (!hash.includes('access_token')) {
    return null;
  }

  const fragments = hash.split('#').filter(Boolean);
  const rawFragment = fragments.find((fragment) => fragment.includes('access_token=')) ?? '';
  if (!rawFragment) {
    return null;
  }

  const paramString = rawFragment.includes('?') ? rawFragment.split('?').pop() ?? '' : rawFragment;
  if (!paramString) {
    return null;
  }

  const params = new URLSearchParams(paramString);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');

  if (!accessToken || !refreshToken || type !== 'recovery') {
    return null;
  }

  return { accessToken, refreshToken };
}

function cleanRecoveryHash() {
  if (typeof window === 'undefined') {
    return;
  }

  const baseUrl = `${window.location.origin}${window.location.pathname}#/reset-password`;
  window.history.replaceState({}, document.title, baseUrl);
}

function clearLoginLockState(email) {
  if (typeof window === 'undefined' || !email) {
    return;
  }

  window.localStorage.removeItem(`login-lock:${email.toLowerCase()}`);
}

function clearAllLoginLockStates() {
  if (typeof window === 'undefined') {
    return;
  }

  const keys = Object.keys(window.localStorage);
  for (const key of keys) {
    if (key.startsWith('login-lock:')) {
      window.localStorage.removeItem(key);
    }
  }
}

export default ResetPasswordPage;
