import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.png';

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

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '4rem',
        padding: '2.5rem clamp(1.5rem, 6vw, 4.25rem)',
        color: '#e2e8f0'
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '2rem',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '1rem',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.6), rgba(14, 165, 233, 0.1))',
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <img src={logo} alt="Panel Contable" style={{ width: '36px', height: '36px', borderRadius: '0.75rem' }} />
          </div>
          <div>
            <strong style={{ fontSize: '1.15rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Panel Contable</strong>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'rgba(226, 232, 240, 0.65)' }}>Finanzas en tiempo real</p>
          </div>
        </div>

        <nav style={{ display: 'flex', gap: '1.75rem', flexWrap: 'wrap' }}>
          {navLinks.map((link) => (
            <a key={link.label} href={link.href} style={{ color: 'rgba(226, 232, 240, 0.72)', textDecoration: 'none', fontWeight: 500 }}>
              {link.label}
            </a>
          ))}
        </nav>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <Link
            to="/login"
            style={{
              padding: '0.7rem 1.4rem',
              borderRadius: '999px',
              border: '1px solid rgba(148, 163, 184, 0.4)',
              color: '#e2e8f0',
              textDecoration: 'none',
              fontWeight: 600
            }}
          >
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            style={{
              padding: '0.7rem 1.6rem',
              borderRadius: '999px',
              background: 'linear-gradient(135deg, #38bdf8 0%, #22d3ee 40%, #34d399 100%)',
              color: '#020617',
              textDecoration: 'none',
              fontWeight: 700,
              boxShadow: '0 18px 35px rgba(56, 189, 248, 0.35)'
            }}
          >
            Crear cuenta
          </Link>
        </div>
      </header>

      <section
        id="inicio"
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          alignItems: 'center',
          gap: '3rem'
        }}
      >
        <div style={{ display: 'grid', gap: '1.75rem' }}>
          <div style={{ display: 'grid', gap: '1rem' }}>
            <span style={{ fontWeight: 600, color: '#38bdf8', letterSpacing: '0.28em', textTransform: 'uppercase' }}>Finanzas claras</span>
            <h1 style={{ margin: 0, fontSize: 'clamp(2.8rem, 4vw, 4.35rem)', lineHeight: 1.05 }}>
              Centraliza ingresos y gastos.
              <br />
              Exporta reportes sin hojas sueltas.
            </h1>
            <p style={{ margin: 0, maxWidth: '560px', color: 'rgba(226, 232, 240, 0.75)', fontSize: '1.1rem', lineHeight: 1.7 }}>
              Panel Contable reúne tus registros contables en un solo lugar: captura movimientos, visualiza métricas en C$ y USD, y descarga reportes listos para tus cierres mensuales.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link
              to="/register"
              style={{
                padding: '0.95rem 2.25rem',
                borderRadius: '1rem',
                background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.9), rgba(45, 212, 191, 0.85))',
                color: '#020617',
                textDecoration: 'none',
                fontWeight: 700,
                boxShadow: '0 22px 40px rgba(56, 189, 248, 0.32)'
              }}
            >
              Probar Panel
            </Link>
            <Link
              to="/login"
              style={{
                padding: '0.95rem 2.25rem',
                borderRadius: '1rem',
                border: '1px solid rgba(148, 163, 184, 0.45)',
                color: '#e2e8f0',
                textDecoration: 'none',
                fontWeight: 600,
                backgroundColor: 'rgba(15, 23, 42, 0.35)'
              }}
            >
              Ver demo en vivo
            </Link>
          </div>

          <ul id="funcionalidades" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '1rem' }}>
            {featureBullets.map((item) => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'rgba(226, 232, 240, 0.8)' }}>
                <span
                  aria-hidden
                  style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #38bdf8, #34d399)',
                    boxShadow: '0 0 12px rgba(56, 189, 248, 0.55)'
                  }}
                />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <aside
          style={{
            borderRadius: '2rem',
            background: 'linear-gradient(160deg, rgba(56, 189, 248, 0.12), rgba(37, 99, 235, 0.08) 45%, rgba(15, 118, 110, 0.16))',
            padding: '2.75rem 2.5rem',
            display: 'grid',
            gap: '2rem',
            boxShadow: '0 30px 80px rgba(15, 118, 110, 0.25)'
          }}
        >
          <div style={{ display: 'grid', gap: '0.65rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.9rem' }}>Lo que obtienes hoy</h2>
            <p style={{ margin: 0, color: 'rgba(226, 232, 240, 0.75)' }}>
              Control del flujo contable, indicadores comprensibles y documentos listos para enviar a tu equipo o auditor.
            </p>
          </div>

          <div style={{ display: 'grid', gap: '1.25rem' }}>
            {spotlightCards.map((feature) => (
              <article
                key={feature.title}
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.55)',
                  borderRadius: '1.35rem',
                  padding: '1.5rem',
                  border: '1px solid rgba(56, 189, 248, 0.18)'
                }}
              >
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#38bdf8' }}>{feature.title}</h3>
                <p style={{ margin: '0.35rem 0 0', color: 'rgba(226, 232, 240, 0.75)' }}>{feature.detail}</p>
              </article>
            ))}
          </div>

          <div id="reportes" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'rgba(226, 232, 240, 0.6)' }}>Ideal para:</span>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontWeight: 600, color: 'rgba(226, 232, 240, 0.75)' }}>
              {trustBadges.map((badge) => (
                <span key={badge}>{badge}</span>
              ))}
            </div>
          </div>
        </aside>
      </section>

      <footer id="seguridad" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', fontSize: '0.85rem', color: 'rgba(226, 232, 240, 0.55)' }}>
        <p style={{ margin: 0 }}>© {new Date().getFullYear()} Panel Contable. Control financiero práctico.</p>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <a href="mailto:soporte@panelcontable.com" style={{ color: 'inherit', textDecoration: 'none' }}>
            soporte@panelcontable.com
          </a>
          <span>Manual de uso</span>
          <span>Política de seguridad</span>
        </div>
      </footer>
    </main>
  );
}

export default PublicHomePage;
