import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient.js';
import { useAuth } from '../context/AuthContext.jsx';
import logo from '../assets/logo.png';
import avatarFemale from '../assets/mujer.png';
import avatarMale from '../assets/hombre.png';
import './ShellLayout.css';

const navItems = [
  { to: '/dashboard', label: 'Inicio' },
  { to: '/incomes', label: 'Ingresos' },
  { to: '/expenses', label: 'Gastos' },
  { to: '/balance', label: 'Balance' },
  { to: '/transfers', label: 'Transferencias' },
  { to: '/reports', label: 'Reportes' }
];

function ShellLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef(null);
  const isAdmin = profile?.role === 'admin';
  const parsedFirstName = useMemo(() => {
    const raw = profile?.firstName ?? profile?.fullName ?? '';
    const segments = raw.split(/\s+/).filter(Boolean);
    return segments[0] ?? null;
  }, [profile]);

  const parsedLastName = useMemo(() => {
    if (profile?.lastName) {
      const segments = profile.lastName.split(/\s+/).filter(Boolean);
      return segments[0] ?? null;
    }

    if (profile?.fullName) {
      const segments = profile.fullName.split(/\s+/).filter(Boolean);
      return segments.length > 1 ? segments[1] : null;
    }

    return null;
  }, [profile]);

  const displayName = useMemo(() => {
    const parts = [parsedFirstName, parsedLastName].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(' ');
    }

    if (profile?.fullName) {
      const segments = profile.fullName.split(/\s+/).filter(Boolean);
      if (segments.length > 0) {
        return segments.slice(0, 2).join(' ');
      }
    }

    if (user?.email) {
      return user.email.split('@')[0];
    }

    return 'Usuario';
  }, [parsedFirstName, parsedLastName, profile, user]);

  const initials = useMemo(() => {
    const chars = [parsedFirstName?.[0], parsedLastName?.[0]].filter(Boolean);
    if (chars.length > 0) {
      return chars.join('').toUpperCase();
    }

    if (profile?.fullName) {
      const segments = profile.fullName.split(/\s+/).filter(Boolean);
      if (segments.length > 0) {
        return segments
          .slice(0, 2)
          .map((segment) => segment[0])
          .join('')
          .toUpperCase();
      }
    }

    if (user?.email) {
      return user.email[0]?.toUpperCase() ?? 'U';
    }

    return 'U';
  }, [parsedFirstName, parsedLastName, profile, user]);

  const avatarSrc = useMemo(() => {
    if (profile?.gender === 'female') {
      return avatarFemale;
    }

    if (profile?.gender === 'male') {
      return avatarMale;
    }

    return null;
  }, [profile]);

  const handleLogout = useCallback(async () => {
    setProfileMenuOpen(false);
    setMobileNavOpen(false);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (!profileMenuOpen) {
      return undefined;
    }

    const handleClick = (event) => {
      if (!menuRef.current) {
        return;
      }

      if (!menuRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [profileMenuOpen]);

  const toggleProfileMenu = useCallback(() => {
    setMobileNavOpen(false);
    setProfileMenuOpen((prev) => !prev);
  }, []);

  const toggleMobileNav = useCallback(() => {
    setProfileMenuOpen(false);
    setMobileNavOpen((prev) => !prev);
  }, []);

  const closeMobileNav = useCallback(() => {
    setMobileNavOpen(false);
  }, []);

  const handleProfileClick = useCallback(() => {
    setProfileMenuOpen(false);
    setMobileNavOpen(false);
    navigate('/profile');
  }, [navigate]);

  useEffect(() => {
    setMobileNavOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

  const navLinkClassName = useCallback(
    ({ isActive }) => `shell-nav-link${isActive ? ' is-active' : ''}`,
    []
  );

  const mobileNavLinkClassName = useCallback(
    ({ isActive }) => `shell-mobile-nav-link${isActive ? ' is-active' : ''}`,
    []
  );

  return (
    <div className="shell-root">
      <header className="shell-header">
        <Link to="/dashboard" className="shell-brand">
          <img src={logo} alt="Panel Contable" className="shell-brand-logo" />
          <div className="shell-brand-copy">
            <strong>Panel Contable</strong>
            <p>Tu resumen financiero centralizado</p>
          </div>
        </Link>

        <nav className="shell-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/dashboard'}
              className={navLinkClassName}
              onClick={closeMobileNav}
            >
              {item.label}
            </NavLink>
          ))}
          {isAdmin ? (
            <NavLink to="/admin/users" className={navLinkClassName} onClick={closeMobileNav}>
              Usuarios
            </NavLink>
          ) : null}
        </nav>

        <div className="shell-header-actions">
          <button
            type="button"
            className="shell-menu-toggle"
            onClick={toggleMobileNav}
            aria-label={mobileNavOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={mobileNavOpen}
            aria-controls="shell-mobile-menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>

          <div className="shell-profile" ref={menuRef}>
            <button
              type="button"
              className="shell-profile-trigger"
              onClick={toggleProfileMenu}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
            >
              <span className="shell-avatar">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={profile?.gender === 'female' ? 'Perfil femenino' : 'Perfil masculino'}
                  />
                ) : (
                  <span className="shell-avatar-initials">{initials}</span>
                )}
              </span>
              <span className="shell-profile-info">
                <span className="shell-profile-name">{displayName}</span>
                <span className="shell-profile-role">{isAdmin ? 'Administrador' : 'Usuario'}</span>
              </span>
              <span className={`shell-profile-caret${profileMenuOpen ? ' is-open' : ''}`} aria-hidden="true" />
            </button>

            {profileMenuOpen ? (
              <div className="shell-profile-menu" role="menu">
                <div className="shell-profile-menu-header">
                  <span className="shell-profile-menu-name">{displayName}</span>
                  <span className="shell-profile-menu-role">{isAdmin ? 'Administrador' : 'Usuario'}</span>
                </div>
                <div className="shell-profile-menu-actions">
                  <button type="button" className="shell-profile-menu-item" onClick={handleProfileClick} role="menuitem">
                    Perfil
                  </button>
                  <button type="button" className="shell-profile-menu-item" onClick={handleLogout} role="menuitem">
                    Cerrar sesión
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {mobileNavOpen ? (
        <>
          <button type="button" className="shell-mobile-backdrop" onClick={closeMobileNav} aria-label="Cerrar menú" />
          <div className="shell-mobile-menu" id="shell-mobile-menu">
            <div className="shell-mobile-user">
              <span className="shell-mobile-user-name">{displayName}</span>
              <span className="shell-mobile-user-role">{isAdmin ? 'Administrador' : 'Usuario'}</span>
            </div>
            <nav className="shell-mobile-nav">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/dashboard'}
                  className={mobileNavLinkClassName}
                  onClick={closeMobileNav}
                >
                  {item.label}
                </NavLink>
              ))}
              {isAdmin ? (
                <NavLink to="/admin/users" className={mobileNavLinkClassName} onClick={closeMobileNav}>
                  Usuarios
                </NavLink>
              ) : null}
            </nav>
            <div className="shell-mobile-actions">
              <button type="button" className="shell-mobile-action" onClick={handleProfileClick}>
                Ver perfil
              </button>
              <button type="button" className="shell-mobile-action shell-mobile-action--danger" onClick={handleLogout}>
                Cerrar sesión
              </button>
            </div>
          </div>
        </>
      ) : null}

      <main className="shell-main">
        <div className="shell-main-inner">{children}</div>
      </main>
    </div>
  );
}

export default ShellLayout;
