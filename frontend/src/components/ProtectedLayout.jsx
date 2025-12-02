import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import ShellLayout from './ShellLayout.jsx';

function ProtectedLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: '100vh',
          backgroundColor: '#020b1d',
          color: '#e2e8f0'
        }}
      >
        <p>Verificando sesión...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <ShellLayout>
      <Outlet />
    </ShellLayout>
  );
}

export default ProtectedLayout;
