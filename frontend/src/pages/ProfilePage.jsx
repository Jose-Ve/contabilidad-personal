import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { supabase } from '../services/supabaseClient.js';
import './ProfilePage.css';

function ProfilePage() {
  const { profile, profileLoading } = useAuth();
  const [sendingReset, setSendingReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState(null);

  const fields = useMemo(() => {
    const genderLabel = profile?.gender === 'female' ? 'Femenino' : profile?.gender === 'male' ? 'Masculino' : 'Sin especificar';

    return [
      { label: 'Nombre', value: profile?.firstName ?? extractFirstName(profile?.fullName) ?? '—' },
      { label: 'Apellido', value: profile?.lastName ?? extractSecondName(profile?.fullName) ?? '—' },
      { label: 'Correo', value: profile?.email ?? '—' },
      { label: 'Contraseña', value: '********' },
      { label: 'Género', value: genderLabel }
    ];
  }, [profile]);

  useEffect(() => {
    if (!resetFeedback) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setResetFeedback(null);
    }, 7000);

    return () => window.clearTimeout(timer);
  }, [resetFeedback]);

  const handlePasswordResetRequest = async () => {
    if (!profile?.email || sendingReset) {
      return;
    }

    try {
      setSendingReset(true);
      setResetFeedback({
        variant: 'success',
        message: 'Solicitud enviada al correo, esto puede tardar en llegar en unos minutos. Revisa tu bandeja de entrada o spam.'
      });

      const redirectTo = `${window.location.origin}${window.location.pathname}#/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
        redirectTo
      });

      if (error) {
        throw error;
      }

      setResetFeedback((current) =>
        current?.variant === 'success'
          ? current
          : {
              variant: 'success',
              message:
                'Solicitud enviada al correo, esto puede tardar en llegar en unos minutos. Revisa tu bandeja de entrada o spam.'
            }
      );
    } catch (error) {
      console.error('Error solicitando cambio de contraseña', error);
      setResetFeedback({
        variant: 'error',
        message: error?.message ?? 'No pudimos enviar el enlace. Intenta nuevamente en unos minutos.'
      });
    } finally {
      setSendingReset(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p className="profile-loading">Cargando perfil...</p>
        </div>
      </div>
    );
  }
  
  if (!profile) {
    return (
      <div className="profile-page">
        <div className="profile-card">
          <p className="profile-loading">No pudimos cargar tus datos. Intenta cerrar sesión e iniciar nuevamente.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <header className="profile-header">
        <div>
          <h1>Tu información personal</h1>
          <p>Revisa los datos vinculados a tu cuenta. Contacta al administrador si necesitas actualizar alguno.</p>
        </div>
      </header>

      <section className="profile-card">
        <div className="profile-card-body">
          <dl className="profile-info-grid">
            {fields.map((field) => (
              <div key={field.label} className="profile-info-item">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>

          <div className="profile-actions">
            <div className="profile-actions__content">
              <h2>¿Necesitas actualizar tu contraseña?</h2>
              <p>Te enviaremos un enlace seguro a tu correo registrado para que elijas una nueva contraseña.</p>
              {resetFeedback ? (
                <p className={`profile-feedback profile-feedback--${resetFeedback.variant}`}>{resetFeedback.message}</p>
              ) : null}
            </div>
            <button
              type="button"
              className="profile-reset-button"
              onClick={handlePasswordResetRequest}
              disabled={sendingReset || !profile?.email}
            >
              {sendingReset ? 'Enviando enlace…' : 'Solicitar cambio de contraseña'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function extractFirstName(fullName) {
  if (!fullName) {
    return null;
  }

  const segments = fullName.split(/\s+/).filter(Boolean);
  return segments[0] ?? null;
}

function extractSecondName(fullName) {
  if (!fullName) {
    return null;
  }

  const segments = fullName.split(/\s+/).filter(Boolean);
  return segments.length > 1 ? segments[1] : null;
}

export default ProfilePage;
