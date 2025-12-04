import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.png';
import './RegisterPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const LETTERS_PATTERN = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+$/;

function RegisterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm({
    defaultValues: { first_name: '', last_name: '', gender: '', email: '', password: '', confirmPassword: '' }
  });

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [error]);

  const sanitizeName = (value) => value.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ\s]+/g, '');

  const normalizeName = (value) =>
    sanitizeName(value)
      .split(/\s+/)
      .filter(Boolean)
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join(' ');

  const handleNameBlur = (field) => (event) => {
    const rawValue = event.target.value;
    const sanitized = sanitizeName(rawValue);
    const formatted = normalizeName(sanitized.trim());
    if (formatted !== rawValue) {
      event.target.value = formatted;
    }
    setValue(field, formatted, {
      shouldValidate: true,
      shouldDirty: formatted !== rawValue
    });
  };

  const onSubmit = async (values) => {
    if (values.password !== values.confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    const sanitizedFirst = sanitizeName(values.first_name);
    const sanitizedLast = sanitizeName(values.last_name);

    const firstName = sanitizedFirst.trim();
    const lastName = sanitizedLast.trim();
    const gender = values.gender;

    if (!firstName || !lastName || !gender) {
      setError('Completa tu nombre, apellido y género para continuar.');
      return;
    }

    if (firstName.length < 3 || lastName.length < 3) {
      setError('Nombre y apellido deben tener al menos 3 caracteres válidos.');
      return;
    }

    const formattedFirstName = normalizeName(firstName);
    const formattedLastName = normalizeName(lastName);

    setValue('first_name', formattedFirstName, {
      shouldValidate: false,
      shouldDirty: formattedFirstName !== values.first_name
    });
    setValue('last_name', formattedLastName, {
      shouldValidate: false,
      shouldDirty: formattedLastName !== values.last_name
    });

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);
      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email.trim(),
          password: values.password,
          first_name: formattedFirstName,
          last_name: formattedLastName,
          gender
        })
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? 'No se pudo crear la cuenta');
      }

      const successMessage =
        payload?.message ??
        'Te has registrado correctamente. Te llegará un mensaje de confirmación a tu correo para poder acceder. El mensaje puede tardar un par de minutos en llegar.';

      setSuccess(successMessage);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="register-page">
      <section className="register-visual" aria-hidden="true">
        <div className="register-visual__top">
          <Link to="/" className="register-logo">
            <div className="register-logo__mark">
              <img src={logo} alt="Panel Contable" />
            </div>
            <span>Panel Contable</span>
          </Link>
        </div>

        <div className="register-visual__center">
          <div className="register-glass">
            <div className="register-glass__halo" />
            <div className="register-glass__content">
              <h2>Panel Financiero Inteligente</h2>
              <p>Orquesta ingresos, gastos y flujo neto en una sola vista.</p>
            </div>
          </div>
        </div>

        <div className="register-visual__footer">
          <p>Decisiones claras. Resultados en tiempo real.</p>
        </div>
      </section>

      <section className="register-form" role="main">
        <div className="register-form__inner">
          <header className="register-form__header">
            <h1>Crea tu cuenta</h1>
            <p>Configura tu espacio y sincroniza a tu equipo contable.</p>
          </header>

          <form onSubmit={handleSubmit(onSubmit)} className="register-form__form" noValidate>
            <label className="form-field">
              <span>Nombre</span>
              <input
                type="text"
                placeholder="Tu nombre"
                {...register('first_name', {
                  required: 'El nombre es obligatorio',
                  minLength: { value: 3, message: 'Mínimo 3 caracteres' },
                  maxLength: { value: 60, message: 'Máximo 60 caracteres' },
                  pattern: { value: LETTERS_PATTERN, message: 'Solo usa letras y espacios' },
                  validate: (value) => value.trim().length >= 3 || 'Debe tener al menos 3 caracteres válidos'
                })}
                className="form-input"
                onBlur={handleNameBlur('first_name')}
              />
              {errors.first_name ? <small className="form-feedback form-feedback--error">{errors.first_name.message}</small> : null}
            </label>

            <label className="form-field">
              <span>Apellido</span>
              <input
                type="text"
                placeholder="Tu apellido"
                {...register('last_name', {
                  required: 'El apellido es obligatorio',
                  minLength: { value: 3, message: 'Mínimo 3 caracteres' },
                  maxLength: { value: 60, message: 'Máximo 60 caracteres' },
                  pattern: { value: LETTERS_PATTERN, message: 'Solo usa letras y espacios' },
                  validate: (value) => value.trim().length >= 3 || 'Debe tener al menos 3 caracteres válidos'
                })}
                className="form-input"
                onBlur={handleNameBlur('last_name')}
              />
              {errors.last_name ? <small className="form-feedback form-feedback--error">{errors.last_name.message}</small> : null}
            </label>

            <label className="form-field">
              <span>Género</span>
              <select
                {...register('gender', { required: 'Selecciona un género' })}
                className="form-input form-input--select"
                defaultValue=""
              >
                <option value="" disabled>
                  Selecciona una opción
                </option>
                <option value="female">Femenino</option>
                <option value="male">Masculino</option>
              </select>
              {errors.gender ? <small className="form-feedback form-feedback--error">{errors.gender.message}</small> : null}
            </label>

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
              {errors.email ? <small className="form-feedback form-feedback--error">{errors.email.message}</small> : null}
            </label>

            <label className="form-field">
              <span>Contraseña</span>
              <div className="form-input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  {...register('password', {
                    required: 'La contraseña es obligatoria',
                    minLength: { value: 8, message: 'Mínimo 8 caracteres' }
                  })}
                  className="form-input"
                />
                <button
                  type="button"
                  className="form-input__toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  <span aria-hidden="true">{showPassword ? '🙈' : '👁️'}</span>
                </button>
              </div>
              {errors.password ? <small className="form-feedback form-feedback--error">{errors.password.message}</small> : null}
            </label>

            <label className="form-field">
              <span>Confirmar contraseña</span>
              <div className="form-input-wrapper">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repite tu contraseña"
                  required
                  {...register('confirmPassword', {
                    required: 'Confirma tu contraseña',
                    validate: (value) => value === watch('password') || 'Las contraseñas no coinciden'
                  })}
                  className="form-input"
                />
                <button
                  type="button"
                  className="form-input__toggle"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'}
                >
                  <span aria-hidden="true">{showConfirmPassword ? '🙈' : '👁️'}</span>
                </button>
              </div>
              {errors.confirmPassword ? (
                <small className="form-feedback form-feedback--error">{errors.confirmPassword.message}</small>
              ) : null}
            </label>

            {error ? <p className="form-feedback form-feedback--error">{error}</p> : null}
            {success ? <p className="form-feedback form-feedback--success">{success}</p> : null}

            <button type="submit" disabled={loading} className="form-submit">
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>

          <p className="register-form__footer">
            ¿Ya tienes cuenta?{' '}
            <Link to="/login" className="register-form__link">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

export default RegisterPage;
