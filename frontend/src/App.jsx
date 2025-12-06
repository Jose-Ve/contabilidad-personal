import { Navigate, Route, Routes } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider } from './context/AuthContext.jsx';
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const IncomesPage = lazy(() => import('./pages/IncomesPage.jsx'));
const ExpensesPage = lazy(() => import('./pages/ExpensesPage.jsx'));
const BalancePage = lazy(() => import('./pages/BalancePage.jsx'));
const TransfersPage = lazy(() => import('./pages/TransfersPage.jsx'));
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const PublicHomePage = lazy(() => import('./pages/PublicHomePage.jsx'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.jsx'));
const ProtectedLayout = lazy(() => import('./components/ProtectedLayout.jsx'));
const PublicLayout = lazy(() => import('./components/PublicLayout.jsx'));
const CreateCategoryPage = lazy(() => import('./pages/CreateCategoryPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));

const LoadingScreen = () => (
  <div
    style={{
      display: 'grid',
      placeItems: 'center',
      minHeight: '100vh',
      backgroundColor: '#020b1d',
      color: '#e2e8f0'
    }}
  >
    <p>Cargando...</p>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="/" element={<PublicHomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          <Route element={<ProtectedLayout />}> 
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/incomes" element={<IncomesPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/balance" element={<BalancePage />} />
            <Route path="/transfers" element={<TransfersPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/categories/new" element={<CreateCategoryPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}

export default App;
