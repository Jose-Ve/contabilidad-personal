# Planificación Técnica - App Contabilidad Personal

## Visión General
Aplicación web para registrar ingresos, gastos y consultar balances con autenticación basada en Supabase. El sistema se divide en:
- **Frontend SPA** (React + Vite recomendado) desplegable en GitHub Pages.
- **Backend API** en Node.js (Fastify sugerido por rendimiento) alojado en un servicio gestionado (Render, Fly.io, Railway, etc.).
- **Supabase** como backend-as-a-service: PostgreSQL + Auth + RLS para aislamiento de datos.

## Arquitectura
1. **Cliente (frontend)**
   - SPA con React + Vite.
   - Consumo de API REST propia para datos sensibles que requieren lógica adicional.
   - Uso de `supabase-js` con `anon key` para autenticación y operaciones delegadas que respeten RLS.
2. **Servidor (backend)**
   - Node.js con Fastify (o Express si se prioriza familiaridad).
   - Middleware de verificación de tokens JWT emitidos por Supabase.
   - Clientes Supabase diferenciados:
     - Cliente autenticado por usuario (utiliza el JWT recibido) para aprovechar RLS.
     - Cliente con `service_role` para operaciones de administración (crear usuarios, cambiar roles) protegido por autorización adicional.
3. **Supabase**
   - Proyecto con tablas personalizadas (`profiles`, `categories`, `incomes`, `expenses`).
   - RLS activado en todas las tablas, políticas por rol.
   - Autenticación email/contraseña.

## Estructura de Carpetas
```
Contabilidad_Program/
├─ frontend/            # SPA, componentes, rutas, servicios HTTP
├─ backend/             # API Node.js, rutas, controladores, validaciones
├─ shared/              # Utilidades y esquemas compartidos (p.ej. validaciones zod)
├─ config/              # Configuración de entornos, plantillas .env, scripts SQL
├─ scripts/             # Scripts de automatización (semillas, despliegue)
└─ docs/                # Documentación, manuales, decisiones técnicas
```

### Carpetas creadas
- `frontend/`: contendrá la aplicación cliente.
- `backend/`: albergará la API.
- `shared/`: módulo para utilidades o tipos usados por frontend y backend.
- `config/`: espacio para plantillas `.env`, configuraciones y políticas RLS.
- `scripts/`: scripts de despliegue, seed y automatizaciones.
- `docs/`: documentación (como el presente archivo).

## Modelo de Datos (Supabase)
### Tabla `profiles`
| Columna    | Tipo        | Descripción                             |
|------------|-------------|-----------------------------------------|
| id         | uuid (PK)   | Misma que `auth.users.id`               |
| email      | text        | Correo del usuario (único)              |
| full_name  | text        | Nombre completo                         |
| role       | text        | `'user'` o `'admin'`                    |
| created_at | timestamptz | Fecha de creación                       |
| updated_at | timestamptz | Última actualización                    |
| deleted_at | timestamptz | Marca de baja lógica (NULL si activo)   |

### Tabla `categories`
| Columna     | Tipo        | Descripción                                   |
|-------------|-------------|-----------------------------------------------|
| id          | uuid (PK)   | Identificador                                 |
| user_id     | uuid (FK)   | Referencia a `profiles.id`                     |
| type        | text        | `'income'` o `'expense'`                      |
| name        | text        | Nombre de la categoría                        |
| created_at  | timestamptz | Creación                                      |
| updated_at  | timestamptz | Actualización                                 |
| deleted_at  | timestamptz | Baja lógica                                   |

### Tablas `incomes` y `expenses`
| Columna     | Tipo             | Descripción                                   |
|-------------|------------------|-----------------------------------------------|
| id          | uuid (PK)        | Identificador                                 |
| user_id     | uuid (FK)        | Referencia a `profiles.id`                     |
| category_id | uuid (FK) null   | Categoría asociada (puede ser NULL)           |
| amount      | numeric(12,2)    | Monto                                         |
| currency    | text             | Moneda (por defecto, moneda local)            |
| date        | date             | Fecha del movimiento                          |
| note        | text             | Observaciones                                 |
| created_at  | timestamptz      | Creación                                      |
| updated_at  | timestamptz      | Actualización                                 |
| deleted_at  | timestamptz      | Baja lógica                                   |

## Políticas de Seguridad (RLS)
1. Habilitar RLS en todas las tablas.
2. Política "propietario": `auth.uid() = user_id` para `incomes`, `expenses`, `categories`.
3. Política "admin": permitir acceso total si `profiles.role = 'admin'`.
4. En `profiles`: usuario solo lee/actualiza su registro; admin puede listar y modificar roles/estado.

## Endpoints Backend
| Método | Ruta                     | Descripción                                         |
|--------|--------------------------|-----------------------------------------------------|
| GET    | `/health`                | Comprobación básica de estado                       |
| GET    | `/me`                    | Devuelve perfil autenticado                         |
| GET    | `/incomes`               | Lista ingresos (filtros `from`, `to`, `category`)   |
| POST   | `/incomes`               | Crea ingreso                                        |
| PUT    | `/incomes/:id`           | Actualiza ingreso propio                            |
| DELETE | `/incomes/:id`           | Baja lógica de ingreso                              |
| GET    | `/expenses`              | Lista gastos                                        |
| POST   | `/expenses`              | Crea gasto                                          |
| PUT    | `/expenses/:id`          | Actualiza gasto propio                              |
| DELETE | `/expenses/:id`          | Baja lógica de gasto                                |
| GET    | `/categories`            | Lista categorías (opcional filtro `type`)           |
| POST   | `/categories`            | Crea categoría                                      |
| PUT    | `/categories/:id`        | Edita categoría                                     |
| DELETE | `/categories/:id`        | Baja lógica de categoría                            |
| GET    | `/balance`               | Balance neto, admite filtros y agrupaciones         |
| GET    | `/admin/users`          | Lista usuarios (solo admin)                        |
| POST   | `/admin/users`          | Crea/invita usuario (solo admin)                   |
| PATCH  | `/admin/users/:id/role` | Cambia rol de usuario (solo admin)                 |
| PATCH  | `/admin/users/:id/state`| Activa/desactiva usuario (solo admin)              |

## Flujo de Autenticación
1. El frontend usa `supabase.auth.signInWithPassword` con email y contraseña.
2. Supabase devuelve session + JWT; el cliente guarda el token de forma segura (storage gestionado por Supabase).
3. Para consumir la API, el cliente envía `Authorization: Bearer <token>`.
4. El backend verifica el token con `supabase.auth.getUser()` usando el JWT recibido.
5. Endpoints admin requieren además validar `role` del perfil.
6. Logout se hace desde el frontend (`supabase.auth.signOut()`); el backend invalida el contexto al no recibir token.

## Manejo de Roles y Permisos
- `profiles.role` define permisos: `user` accede solo a sus datos, `admin` accede a todos.
- Middleware `requireRole` para rutas protegidas.
- UI condicional: las opciones de administración solo se muestran si el rol es admin, pero la lógica se refuerza en el backend + RLS.

## Recomendaciones de Seguridad
- Validar inputs con Zod o Joi en la API.
- Sanitizar texto antes de mostrarlo (XSS).
- Configurar `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`.
- Forzar HTTPS, cookies `Secure` si se usan.
- Rate limiting por IP y usuario.
- Usar soft delete (`deleted_at`) para preservar historial.
- Respuestas de error genéricas; logs estructurados.

## Recomendaciones de UI
- Diseño responsivo con componentes reutilizables.
- Formularios de ingresos/gastos simples, con validaciones en cliente.
- Dashboard con resumen (ingresos vs gastos) y tarjetas destacadas.
- Vistas de tablas con filtros por fecha, categoría y texto.
- Sección admin con tabla paginada, filtros por rol y estado.

## Opciones de Despliegue
- **Frontend (GitHub Pages)**: viable porque la SPA es estática. Requiere build con rutas basadas en hash (`react-router-dom` con `HashRouter`) o configuración de 404 personalizado.
- **Backend**: necesita hosting separado (Render, Fly.io, Railway). GitHub Pages no ejecuta Node.js.
- **Supabase**: alojado por Supabase.

## Funcionalidades Adicionales Opcionales
- Gráficas (Chart.js, Recharts) para tendencias.
- Exportar a CSV/Excel.
- Presupuestos por categoría.
- Multi-moneda con conversión.
- PWA para acceso offline limitado.

---
Este documento sirve como base para la implementación: describe la arquitectura, las entidades principales, los endpoints necesarios y las consideraciones de seguridad y despliegue. Ajusta los detalles conforme avances en el desarrollo.
