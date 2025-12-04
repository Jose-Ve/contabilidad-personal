import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiFetch } from '../services/apiClient.js';
import './AdminUsersPage.css';

const genderLabels = {
  female: 'Femenino',
  male: 'Masculino'
};

function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alert, setAlert] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', gender: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [confirmationFilter, setConfirmationFilter] = useState('all');

  const loadUsers = useCallback(async () => {
    if (!user) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await apiFetch('/admin/users');
      setUsers(Array.isArray(payload) ? payload : []);
      setError(null);
    } catch (err) {
      console.error('Error cargando usuarios', err);
      setError(err.message ?? 'No se pudieron cargar los usuarios');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!alert) {
      return undefined;
    }

    const timer = setTimeout(() => setAlert(null), 4000);
    return () => clearTimeout(timer);
  }, [alert]);

  const updateUserInState = useCallback((nextUser) => {
    setUsers((prev) => prev.map((item) => (item.id === nextUser.id ? { ...item, ...nextUser } : item)));
  }, []);

  const handleChangeRole = useCallback(
    async (record) => {
      const nextRole = record.role === 'admin' ? 'user' : 'admin';
      setConfirmModal({
        type: 'role',
        user: record,
        payload: { role: nextRole }
      });
    },
    [updateUserInState]
  );

  const handleToggleActive = useCallback(
    async (record) => {
      const nextActive = !record.active;
      setConfirmModal({
        type: 'state',
        user: record,
        payload: { active: nextActive }
      });
    },
    [updateUserInState]
  );

  const closeConfirmModal = useCallback(() => {
    setConfirmModal(null);
  }, []);

  const applyConfirmModal = useCallback(async () => {
    if (!confirmModal) {
      return;
    }

    const { user: target, type, payload } = confirmModal;

    if (type === 'role') {
      setPendingAction(`role:${target.id}`);
      try {
        const updated = await apiFetch(`/admin/users/${target.id}/role`, {
          method: 'PATCH',
          body: payload
        });
        updateUserInState(updated);
        setAlert({ type: 'success', message: 'Rol actualizado correctamente.' });
      } catch (err) {
        console.error('Error cambiando rol', err);
        setAlert({ type: 'error', message: err.message ?? 'No se pudo cambiar el rol.' });
      } finally {
        setPendingAction(null);
      }
    } else if (type === 'state') {
      setPendingAction(`state:${target.id}`);
      try {
        const updated = await apiFetch(`/admin/users/${target.id}/state`, {
          method: 'PATCH',
          body: payload
        });
        updateUserInState(updated);
        setAlert({
          type: 'success',
          message: payload.active ? 'Cuenta reactivada correctamente.' : 'Cuenta desactivada correctamente.'
        });
      } catch (err) {
        console.error('Error actualizando estado', err);
        setAlert({ type: 'error', message: err.message ?? 'No se pudo actualizar el estado.' });
      } finally {
        setPendingAction(null);
      }
    }

    setConfirmModal(null);
  }, [confirmModal, updateUserInState]);

  const handleOpenEdit = useCallback((record) => {
    const firstName = record.first_name ?? extractFirstName(record.full_name) ?? '';
    const lastName = record.last_name ?? extractLastName(record.full_name) ?? '';
    setEditForm({ first_name: firstName, last_name: lastName, gender: record.gender ?? '' });
    setEditingUser(record);
  }, []);

  const handleEditChange = useCallback((event) => {
    const { name, value } = event.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditingUser(null);
    setSavingEdit(false);
  }, []);

  const handleSubmitEdit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!editingUser) {
        return;
      }

      const trimmedFirst = editForm.first_name.trim();
      const trimmedLast = editForm.last_name.trim();
      if (!trimmedFirst || !trimmedLast || !editForm.gender) {
        setAlert({ type: 'error', message: 'Completa nombre, apellido y género.' });
        return;
      }

      setSavingEdit(true);
      try {
        const updated = await apiFetch(`/admin/users/${editingUser.id}/profile`, {
          method: 'PATCH',
          body: {
            first_name: trimmedFirst,
            last_name: trimmedLast,
            gender: editForm.gender
          }
        });
        updateUserInState(updated);
        setAlert({ type: 'success', message: 'Datos de usuario actualizados.' });
        handleCloseEdit();
      } catch (err) {
        console.error('Error actualizando datos del usuario', err);
        setAlert({ type: 'error', message: err.message ?? 'No se pudieron guardar los cambios.' });
      } finally {
        setSavingEdit(false);
      }
    },
    [editForm, editingUser, handleCloseEdit, updateUserInState]
  );

  const sortedUsers = useMemo(
    () =>
      users
        .slice()
        .sort((a, b) => getSafeTimestamp(b.created_at) - getSafeTimestamp(a.created_at)),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return sortedUsers.filter((item) => {
      const matchesSearch =
        normalizedSearch.length === 0
          ? true
          : [item.email, item.first_name, item.last_name, item.full_name]
              .filter(Boolean)
              .some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesRole = roleFilter === 'all' || item.role === roleFilter;
      const matchesState = stateFilter === 'all' || (item.active ? 'active' : 'inactive') === stateFilter;
      const matchesConfirmation =
        confirmationFilter === 'all' ||
        (confirmationFilter === 'confirmed' ? Boolean(item.email_confirmed_at) : !item.email_confirmed_at);

      return matchesSearch && matchesRole && matchesState && matchesConfirmation;
    });
  }, [sortedUsers, searchTerm, roleFilter, stateFilter, confirmationFilter]);

  return (
    <section className="users">
      <header className="users__header">
        <h2>Gestión de usuarios</h2>
        <p>Disponible solo para administradores. Mantén el acceso seguro y roles actualizados desde un entorno unificado.</p>
      </header>

      <article className="users-card">
        <span className="users-card__status">
          <span aria-hidden>🛡️</span>
          Seguridad en vivo
        </span>

        <div className="users-card__filters" role="search">
          <div className="users-filter users-filter--search">
            <label htmlFor="users-filter-search">Buscar</label>
            <input
              id="users-filter-search"
              type="search"
              placeholder="Buscar por nombre o correo"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
          <div className="users-filter">
            <label htmlFor="users-filter-role">Rol</label>
            <select
              id="users-filter-role"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              <option value="admin">Administradores</option>
              <option value="user">Usuarios</option>
            </select>
          </div>
          <div className="users-filter">
            <label htmlFor="users-filter-state">Cuenta</label>
            <select
              id="users-filter-state"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
            >
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="inactive">Inactivas</option>
            </select>
          </div>
          <div className="users-filter">
            <label htmlFor="users-filter-confirmation">Correo</label>
            <select
              id="users-filter-confirmation"
              value={confirmationFilter}
              onChange={(event) => setConfirmationFilter(event.target.value)}
            >
              <option value="all">Todos</option>
              <option value="confirmed">Confirmados</option>
              <option value="pending">Pendientes</option>
            </select>
          </div>
        </div>

        {alert ? (
          <div className={`users-alert users-alert--${alert.type}`}>{alert.message}</div>
        ) : null}

        {loading ? <p className="users-empty">Cargando usuarios...</p> : null}
        {error ? <p className="users-error">{error}</p> : null}

        {!loading && !error ? (
          filteredUsers.length === 0 ? (
            <p className="users-empty">No se encontraron usuarios con los filtros aplicados.</p>
          ) : (
          <div className="users-table__wrapper">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Nombre</th>
                  <th>Apellido</th>
                  <th>Género</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th className="users-table__actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((item) => (
                  <tr key={item.id}>
                    <td>{item.email}</td>
                    <td>{item.first_name ?? extractFirstName(item.full_name) ?? '—'}</td>
                    <td>{item.last_name ?? extractLastName(item.full_name) ?? '—'}</td>
                    <td className="users-table__gender">{genderLabels[item.gender] ?? 'Sin registrar'}</td>
                    <td className="users-table__role">{item.role}</td>
                    <td>
                      <span className={`users-table__badge ${item.active ? '' : 'users-table__badge--inactive'}`}>
                        {item.active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="users-table__actions">
                      <button
                        type="button"
                        className="users-action users-action--primary"
                        onClick={() => handleChangeRole(item)}
                        disabled={pendingAction === `role:${item.id}`}
                      >
                        Cambiar rol
                      </button>
                      <button
                        type="button"
                        className="users-action users-action--ghost"
                        onClick={() => handleOpenEdit(item)}
                        disabled={pendingAction?.startsWith('role:') || pendingAction?.startsWith('state:')}
                      >
                        Ver datos
                      </button>
                      <button
                        type="button"
                        className={`users-action ${item.active ? 'users-action--danger' : 'users-action--success'}`}
                        onClick={() => handleToggleActive(item)}
                        disabled={pendingAction === `state:${item.id}`}
                      >
                        {item.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )
        ) : null}
      </article>

      {editingUser ? (
        <div
          className="users-modal"
          role="dialog"
          aria-modal="true"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseEdit();
            }
          }}
        >
          <div className="users-modal__content">
            <header className="users-modal__header">
              <div>
                <h3>Detalles del usuario</h3>
                <p>{editingUser.email}</p>
              </div>
              <button type="button" className="users-modal__close" onClick={handleCloseEdit} aria-label="Cerrar">
                ×
              </button>
            </header>
            <form className="users-modal__form" onSubmit={handleSubmitEdit}>
              <p className="users-modal__notice">
                Puedes cambiar los datos de este usuario.
                <span
                  className={`users-status ${editingUser.email_confirmed_at ? 'users-status--confirmed' : 'users-status--pending'}`}
                >
                  {editingUser.email_confirmed_at ? 'Correo confirmado' : 'Correo pendiente'}
                </span>
              </p>
              <label className="users-modal__field">
                <span>Nombre</span>
                <input
                  name="first_name"
                  type="text"
                  value={editForm.first_name}
                  onChange={handleEditChange}
                  placeholder="Nombre"
                  required
                />
              </label>
              <label className="users-modal__field">
                <span>Apellido</span>
                <input
                  name="last_name"
                  type="text"
                  value={editForm.last_name}
                  onChange={handleEditChange}
                  placeholder="Apellido"
                  required
                />
              </label>
              <label className="users-modal__field">
                <span>Género</span>
                <select name="gender" value={editForm.gender} onChange={handleEditChange} required>
                  <option value="" disabled>
                    Selecciona un género
                  </option>
                  <option value="female">Femenino</option>
                  <option value="male">Masculino</option>
                </select>
              </label>
              <div className="users-modal__footer">
                <button type="button" className="users-action users-action--ghost" onClick={handleCloseEdit} disabled={savingEdit}>
                  Cancelar
                </button>
                <button type="submit" className="users-action users-action--primary" disabled={savingEdit}>
                  {savingEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
              <dl className="users-modal__meta">
                <div>
                  <dt>Creado</dt>
                  <dd>{formatDate(editingUser.created_at)}</dd>
                </div>
                <div>
                  <dt>Actualizado</dt>
                  <dd>{formatDate(editingUser.updated_at)}</dd>
                </div>
                <div>
                  <dt>Estado del correo</dt>
                  <dd>
                    {editingUser.email_confirmed_at
                      ? `Confirmado (${formatDate(editingUser.email_confirmed_at)})`
                      : 'Pendiente de confirmación'}
                  </dd>
                </div>
              </dl>
            </form>
          </div>
        </div>
      ) : null}

      {confirmModal ? (
        <div className="users-modal" role="dialog" aria-modal="true">
          <div className="users-modal__content">
            <header className="users-modal__header">
              <div>
                <h3>{confirmModal.type === 'role' ? 'Confirmar cambio de rol' : 'Confirmar estado de cuenta'}</h3>
                <p>{confirmModal.user.email}</p>
              </div>
              <button
                type="button"
                className="users-modal__close"
                onClick={closeConfirmModal}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <div className="users-modal__body">
              <p>
                {confirmModal.type === 'role'
                  ? confirmModal.payload.role === 'admin'
                    ? '¿Seguro que quieres otorgar privilegios de administrador?'
                    : '¿Seguro que quieres quitar los privilegios de administrador?'
                  : confirmModal.payload.active
                  ? '¿Reactivar la cuenta para que pueda iniciar sesión nuevamente?'
                  : '¿Desactivar la cuenta y bloquear el acceso del usuario?'}
              </p>
            </div>
            <div className="users-modal__footer">
              <button
                type="button"
                className="users-action users-action--ghost"
                onClick={closeConfirmModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`users-action ${confirmModal.type === 'state' && !confirmModal.payload.active ? 'users-action--danger' : 'users-action--primary'}`}
                onClick={applyConfirmModal}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function extractFirstName(fullName) {
  if (!fullName) {
    return null;
  }

  const segments = fullName.split(/\s+/).filter(Boolean);
  return segments[0] ?? null;
}

function extractLastName(fullName) {
  if (!fullName) {
    return null;
  }

  const segments = fullName.split(/\s+/).filter(Boolean);
  return segments.length > 1 ? segments.slice(1).join(' ') : null;
}

function formatDate(value) {
  if (!value) {
    return '—';
  }

  try {
    return new Date(value).toLocaleString('es-NI');
  } catch (_error) {
    return value;
  }
}

function getSafeTimestamp(value) {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export default AdminUsersPage;
