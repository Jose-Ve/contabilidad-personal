import { useForm } from 'react-hook-form';
import { supabase } from '../services/supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { apiFetch } from '../services/apiClient.js';
import logo from '../assets/logo.png';
import './LoginPage.css';

const MAX_FAILED_ATTEMPTS = 3;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutos

const EMPTY_LOCK_STATE = { attempts: 0, lockedUntil: null };

function LoginPage() {
  const {
    register,
    handleSubmit,
    formState: { errors, submitCount },
    watch
  } = useForm({ mode: 'onSubmit', reValidateMode: 'onChange' });
  const { user } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
  const [resendCount, setResendCount] = useState(0);
  const [toast, setToast] = useState(null);
  const [suppressRedirect, setSuppressRedirect] = useState(false);
  const [lockState, setLockState] = useState(() => ({ ...EMPTY_LOCK_STATE }));
  const [lockCountdown, setLockCountdown] = useState(null);
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();

  const emailValue = watch('email');

  useEffect(() => {
    if (user && !suppressRedirect) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, suppressRedirect, navigate]);

  useEffect(() => {
    if (!user && suppressRedirect) {
      setSuppressRedirect(false);
    }
  }, [user, suppressRedirect]);

  useEffect(() => {
    if (!emailValue) {
      setLockState({ ...EMPTY_LOCK_STATE });
      setLockCountdown(null);
      return;
    }

    const stored = loadLockState(emailValue);
    setLockState(stored);
  }, [emailValue]);

  const isLocked = lockState.lockedUntil ? lockState.lockedUntil > Date.now() : false;

  useEffect(() => {
    if (!lockState.lockedUntil) {
      setLockCountdown(null);
      return;
    }

    if (!isLocked) {
      setLockState({ ...EMPTY_LOCK_STATE });
      if (emailValue) {
        clearLockState(emailValue);
      }
      setLockCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const remaining = lockState.lockedUntil - Date.now();
      if (remaining <= 0) {
        setLockState({ ...EMPTY_LOCK_STATE });
        if (emailValue) {
          clearLockState(emailValue);
        }
        setLockCountdown(null);
        return;
      }

      setLockCountdown(formatDuration(remaining));
    };

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(timer);
  }, [lockState.lockedUntil, emailValue, isLocked]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setToast(null);
    }, 5000);

    return () => clearTimeout(timer);
  }, [toast]);

  if (user && !suppressRedirect) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          background:
            'radial-gradient(circle at top left, rgba(59, 130, 246, 0.25), transparent 55%), radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.2), transparent 60%), linear-gradient(180deg, #030712 0%, #02030a 100%)',
          color: '#e2e8f0'
        }}
      >
        <p>Redirigiendo…</p>
      </div>
    );
  }

  const onSubmit = async (values) => {
    if (isLocked) {
      setError(
        lockCountdown
          ? `Bloqueamos temporalmente el inicio de sesión por seguridad. Espera ${lockCountdown} o restablece tu contraseña.`
          : 'Bloqueamos temporalmente el inicio de sesión por seguridad. Solicita el reinicio de tu contraseña para continuar.'
      );
      return;
    }

    setLoading(true);
    setError(null);
    setToast(null);
    if (unconfirmedEmail && unconfirmedEmail !== values.email) {
      setResendCount(0);
    }
    setUnconfirmedEmail(null);
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password
    });

    if (signInError) {
      const normalized = signInError.message ? signInError.message.toLowerCase() : '';
      let message = signInError.message;

      if (normalized.includes('invalid login credentials')) {
        const result = recordFailedAttempt(values.email, lockState);
        setLockState(result.state);
        if (result.locked) {
          message = `Ingresaste una contraseña incorrecta demasiadas veces. Espera ${formatDuration(result.remainingMs)} o restablece tu contraseña.`;
        } else {
          const remainingTries = Math.max(MAX_FAILED_ATTEMPTS - result.state.attempts, 0);
          message = remainingTries > 0
            ? `Contraseña incorrecta. Intentos restantes: ${remainingTries}.`
            : 'Contraseña incorrecta.';
        }
      } else if (normalized.includes('email not confirmed')) {
        message = 'Debes confirmar tu correo para acceder. Revisa tu bandeja de entrada.';
        setUnconfirmedEmail(values.email);
      }

      setError(message);
      setLoading(false);
      return;
    }

    const disabled = signInData?.user?.app_metadata?.disabled === true;
    if (disabled) {
      setSuppressRedirect(true);
      await supabase.auth.signOut();
      setError('Tu cuenta está desactivada por un administrador. Ponte en contacto para reactivarla.');
      setLoading(false);
      return;
    }

    setLoading(false);
    setUnconfirmedEmail(null);
    setResendCount(0);
    clearLockState(values.email);
    setLockState({ ...EMPTY_LOCK_STATE });
    navigate('/dashboard', { replace: true });
  };

  const handleResendVerification = async () => {
    if (!unconfirmedEmail) {
      return;
    }

    if (resendCount >= 2) {
      setToast({ message: 'Parece que no ha llegado tu correo, vuelve a registrarte e ingresa bien tu correo.', variant: 'warning' });
      return;
    }

    try {
      await apiFetch('/register/resend', {
        method: 'POST',
        body: { email: unconfirmedEmail }
      });
      setResendCount((count) => count + 1);
      setToast({ message: 'Te enviamos un nuevo correo de verificación. Revísalo en unos segundos.', variant: 'success' });
    } catch (resendError) {
      console.error('Error reenviando confirmación', resendError);
      setToast({ message: resendError.message ?? 'No pudimos reenviar el correo. Intenta más tarde.', variant: 'error' });
    }
  };

  const handlePasswordResetFromLogin = async () => {
    setError(null);
    setToast(null);
    const targetEmail = emailValue?.trim();
    if (!targetEmail) {
      setError('Ingresa tu correo para poder enviarte el enlace de recuperación.');
      return;
    }

    try {
      setResetLoading(true);
      const redirectTo = `${window.location.origin}${window.location.pathname}#/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, { redirectTo });
      if (resetError) {
        throw resetError;
      }
      setToast({
        message: 'Te enviamos un enlace para restablecer tu contraseña. El correo puede tardar algunos minutos en llegar; revisa tu correo o carpeta de spam.',
        variant: 'success'
      });
    } catch (resetError) {
      console.error('Error solicitando reset desde login', resetError);
      setError(resetError?.message ?? 'No pudimos enviar el enlace. Intenta nuevamente en unos minutos.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
      <main className="login-page">
        <section className="login-form" role="main">
          <div className="login-form__inner">
            <header className="login-form__header">
              <Link to="/" className="login-form__brand">
                <div className="login-form__logo">
                  <img src={logo} alt="Panel Contable" />
                </div>
                <span>Panel Contable</span>
              </Link>
              <div>
                <h1>Inicia sesión</h1>
                <p>Administra tu tablero con seguridad reforzada y datos en vivo.</p>
              </div>
            </header>

            <form onSubmit={handleSubmit(onSubmit)} className="login-form__form" noValidate>
              <label className="form-field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  placeholder="tu@correo.com"
                  required
                  {...register('email', {
                    required: 'El correo es obligatorio',
                    pattern: {
                      value: /^[^\s@]+@[^\s@]+\.(com|es|org|edu|gov|ni)$/i,
                      message: 'Usa un dominio válido (.com, .es, .org, .edu, .gov, .ni)'
                    }
                  })}
                  className="form-input"
                />
                {submitCount > 0 && errors.email ? (
                  <small className="form-feedback form-feedback--error">{errors.email.message}</small>
                ) : null}
              </label>

              <label className="form-field">
                <span>Contraseña</span>
                <input
                  type="password"
                  placeholder="••••••••"
                  required
                  {...register('password', { required: 'La contraseña es obligatoria' })}
                  className="form-input"
                />
                {submitCount > 0 && errors.password ? (
                  <small className="form-feedback form-feedback--error">{errors.password.message}</small>
                ) : null}
              </label>

              {error ? <p className="form-feedback form-feedback--error">{error}</p> : null}

              {isLocked ? (
                <div className="login-lock-warning">
                  <p>
                    Por seguridad bloqueamos el inicio de sesión durante unos minutos. {lockCountdown ? `Tiempo restante: ${lockCountdown}. ` : ''}
                    Si olvidaste tu contraseña, puedes solicitar un enlace de recuperación.
                  </p>
                  <button
                    type="button"
                    className="login-reset-button"
                    onClick={handlePasswordResetFromLogin}
                    disabled={resetLoading}
                  >
                    {resetLoading ? 'Enviando enlace…' : 'Enviar enlace para restablecer contraseña'}
                  </button>
                </div>
              ) : null}

              {unconfirmedEmail ? (
                <div className="login-resend">
                  <span>¿No encuentras el correo?</span>
                  <button type="button" onClick={handleResendVerification} className="login-resend__button" disabled={loading}>
                    Reenviar verificación
                  </button>
                  {resendCount > 0 && resendCount < 3 ? (
                    <small>Intentos usados: {resendCount} de 2</small>
                  ) : null}
                </div>
              ) : null}

              <button type="submit" disabled={loading || isLocked} className="form-submit">
                {loading ? 'Ingresando…' : 'Entrar'}
              </button>
            </form>

            <p className="login-form__footer">
              ¿Aún no tienes cuenta? <Link to="/register" className="login-form__link">Registrarte</Link>
            </p>
          </div>
        </section>

        <section className="login-visual" aria-hidden="true">
          <div className="login-visual__top">
            <span>Acceso seguro</span>
          </div>

          <div className="login-visual__center">
            <div className="login-glass">
              <div className="login-glass__halo" />
              <div className="login-glass__content">
                <h2>Visibilidad inmediata</h2>
                <p>
                  Administra tus finanzas con confianza. Nuestro panel intuitivo te ofrece una visión clara y en tiempo real de tus ingresos y gastos, permitiéndote tomar decisiones informadas al instante.
                </p>
              </div>
            </div>
          </div>

          <div className="login-visual__footer">
            <p>Panel Contable · Protección y claridad 24/7</p>
          </div>
        </section>
      </main>
      {toast ? <div className={`login-toast login-toast--${toast.variant}`}>{toast.message}</div> : null}
    </>
  );
}

function recordFailedAttempt(email, currentState) {
  const baseState = currentState ?? EMPTY_LOCK_STATE;
  const attempts = Math.min((baseState.attempts ?? 0) + 1, MAX_FAILED_ATTEMPTS);
  const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;
  const lockedUntil = shouldLock ? Date.now() + LOCK_DURATION_MS : baseState.lockedUntil ?? null;
  const state = { attempts, lockedUntil };
  persistLockState(email, state);
  const remainingMs = lockedUntil ? Math.max(lockedUntil - Date.now(), 0) : null;
  return { state, locked: shouldLock, remainingMs };
}

function loadLockState(email) {
  if (!email || typeof window === 'undefined') {
    return EMPTY_LOCK_STATE;
  }

  try {
    const stored = window.localStorage.getItem(getLockKey(email));
    if (!stored) {
      return EMPTY_LOCK_STATE;
    }

    const parsed = JSON.parse(stored);
    if (parsed.lockedUntil && parsed.lockedUntil <= Date.now()) {
      window.localStorage.removeItem(getLockKey(email));
      return EMPTY_LOCK_STATE;
    }

    return {
      attempts: Number.isFinite(parsed.attempts) ? parsed.attempts : 0,
      lockedUntil: Number.isFinite(parsed.lockedUntil) ? parsed.lockedUntil : null
    };
  } catch (err) {
    console.warn('No pudimos leer el estado de bloqueo del login', err);
    return EMPTY_LOCK_STATE;
  }
}

function persistLockState(email, state) {
  if (!email || typeof window === 'undefined') {
    return;
  }

  if (!state.attempts && !state.lockedUntil) {
    window.localStorage.removeItem(getLockKey(email));
    return;
  }

  window.localStorage.setItem(getLockKey(email), JSON.stringify(state));
}

function clearLockState(email) {
  if (!email || typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getLockKey(email));
}

function getLockKey(email) {
  return `login-lock:${email.toLowerCase()}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds} s`;
  }
  return `${minutes} min ${seconds.toString().padStart(2, '0')} s`;
}

export default LoginPage;
