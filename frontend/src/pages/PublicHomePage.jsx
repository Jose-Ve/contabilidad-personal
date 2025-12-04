import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.png';
import './PublicHomePage.css';

const navLinks = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Funcionalidades', href: '#funcionalidades' },
  { label: 'Reportes', href: '#reportes' },
  { label: 'Seguridad', href: '#seguridad' }
];

const featureBullets = [
  'Dashboard de los últimos 15 días con ingresos en C$ y equivalentes en USD.',
  'Balance mensual con filtros por rango y arrastre de saldos.',
  'Gestión de ingresos, gastos y categorías con notas y origen bancario o efectivo.'
];

const spotlightCards = [
  { title: 'Moneda doble', detail: 'Registra movimientos en C$ o USD y obtén equivalencias automáticas en ambos reportes.' },
  { title: 'Exportaciones listas', detail: 'Descarga balances, ingresos o gastos en Excel (formato contable) o PDF para compartir.' },
  { title: 'Autenticación segura', detail: 'Inicios de sesión con bloqueo por intentos fallidos y restablecimiento por correo vía Supabase.' }
];

const trustBadges = ['Equipos contables', 'Negocios de servicios', 'Consultores financieros'];

function PublicHomePage() {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const toggleMenu = () => {
    setMenuOpen((prev) => !prev);
  };

  const closeMenu = () => {
    setMenuOpen(false);
  };

  return (
    <main className="landing-main">
      <header className="landing-header">
        <div className="landing-brand">
          <div className="landing-brand-icon">
            <img src={logo} alt="Panel Contable" className="landing-brand-logo" />
          </div>
          <div className="landing-brand-copy">
            <strong>Panel Contable</strong>
            <p>Finanzas en tiempo real</p>
          </div>
        </div>

        <button
          type="button"
          className="landing-menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="landing-nav"
          aria-label={menuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
          onClick={toggleMenu}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <nav className={`landing-nav${menuOpen ? ' is-open' : ''}`} id="landing-nav">
          <div className="landing-nav-links">
            {navLinks.map((link) => (
              <a key={link.label} href={link.href} className="landing-nav-link" onClick={closeMenu}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="landing-auth">
            <Link to="/login" className="landing-auth-button landing-auth-button--outline" onClick={closeMenu}>
              Iniciar sesión
            </Link>
            <Link to="/register" className="landing-auth-button landing-auth-button--primary" onClick={closeMenu}>
              Crear cuenta
            </Link>
          </div>
        </nav>
      </header>

      <section className="landing-hero" id="inicio">
        <div className="landing-hero-content">
          <div className="landing-hero-copy">
            <span className="landing-eyebrow">Finanzas claras</span>
            <h1 className="landing-title">
              Centraliza ingresos y gastos.
              <br />
              Exporta reportes sin hojas sueltas.
            </h1>
            <p className="landing-description">
              Panel Contable reúne tus registros contables en un solo lugar: captura movimientos, visualiza métricas en C$ y USD, y
              descarga reportes listos para tus cierres mensuales.
            </p>
          </div>

          <div className="landing-cta">
            <Link to="/register" className="landing-cta-button landing-cta-button--primary">
              Probar Panel
            </Link>
            <Link to="/login" className="landing-cta-button landing-cta-button--outline">
              Ver demo en vivo
            </Link>
          </div>

          <ul className="landing-feature-list" id="funcionalidades">
            {featureBullets.map((item) => (
              <li key={item} className="landing-feature-item">
                <span className="landing-feature-dot" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <aside className="landing-card" id="reportes">
          <div className="landing-card-header">
            <h2 className="landing-card-title">Lo que obtienes hoy</h2>
            <p className="landing-card-description">
              Control del flujo contable, indicadores comprensibles y documentos listos para enviar a tu equipo o auditor.
            </p>
          </div>

          <div className="landing-card-items">
            {spotlightCards.map((feature) => (
              <article key={feature.title} className="landing-card-item">
                <h3>{feature.title}</h3>
                <p>{feature.detail}</p>
              </article>
            ))}
          </div>

          <div className="landing-card-badges">
            <span className="landing-card-badges-label">Ideal para:</span>
            <div className="landing-card-badges-list">
              {trustBadges.map((badge) => (
                <span key={badge}>{badge}</span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <footer className="landing-footer" id="seguridad">
        <p>© 2025 VelazCorp. Panel Contable. Control financiero práctico.</p>
        <div className="landing-footer-links">
          <a
            href="https://mail.google.com/mail/?view=cm&fs=1&to=joseleonelvr@gmail.com"
            target="_blank"
            rel="noreferrer"
          >
            joseleonelvr@gmail.com
          </a>
          <span>Manual de uso</span>
          <span>Política de seguridad</span>
        </div>
      </footer>
    </main>
  );
}

export default PublicHomePage;
