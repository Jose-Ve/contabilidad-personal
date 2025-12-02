# Guía Paso a Paso: GitHub, Supabase y Hosting Gratuito

Esta guía describe cómo preparar el repositorio, crear el proyecto en Supabase, desplegar el frontend en GitHub Pages y alojar el backend sin coste usando servicios con plan gratuito (ej. Render). Sigue las secciones en orden.

---

## 1. Preparar el repositorio en GitHub
1. **Crear el repositorio remoto**:
   - Accede a [https://github.com/new](https://github.com/new).
   - Nombre sugerido: `contabilidad-personal`.
   - Mantén el repositorio público (GitHub Pages solo funciona con público o con GitHub Pro).
   - No añadir README ni `.gitignore` (ya los tendremos local).
2. **Inicializar git en tu proyecto local** (PowerShell):
   ```powershell
   cd "c:\Users\leone\Desktop\Contabilidad_Program"
   git init
   git remote add origin https://github.com/TU_USUARIO/contabilidad-personal.git
   git add .
   git commit -m "chore: estructura inicial"
   git branch -M main
   git push -u origin main
   ```
   > Asegúrate de sustituir `TU_USUARIO` por tu nombre de usuario real y autenticarte cuando Git lo pida.

---

## 2. Crear el proyecto en Supabase
1. Inicia sesión en [https://supabase.com/](https://supabase.com/) y crea un proyecto.
2. Elige región cercana y el plan gratuito (Free Tier).
3. Guarda las credenciales mostradas al crear el proyecto (`API URL`, `anon key`, `service_role key`).
4. En el panel de Supabase:
   - Ve a **Authentication → Providers** y asegura que `Email` esté habilitado.
   - En **Settings → API** copia el `JWT secret` para usarlo en el backend.
   - Crea las tablas (`profiles`, `categories`, `incomes`, `expenses`) usando el editor SQL o importando el script que añadiremos en `config/`.
   - Activa RLS en cada tabla y agrega las políticas indicadas en la documentación (`plan_proyecto.md`).
5. Configura variables de entorno:
   - Copia `config/frontend.env.example` a `frontend/.env.local` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
   - Copia `config/backend.env.example` a `backend/.env` y rellena `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_JWT_SECRET`.

---

## 3. Desplegar el frontend en GitHub Pages
1. Dentro de `frontend/` inicializa el proyecto (por ejemplo con Vite + React):
   ```powershell
   cd "c:\Users\leone\Desktop\Contabilidad_Program\frontend"
   npm create vite@latest . -- --template react
   npm install
   ```
2. Ajusta el `vite.config.js` para usar `base: '/contabilidad-personal/'` (o el nombre de tu repo) y considera usar `HashRouter` para evitar problemas de rutas en GitHub Pages.
3. Agrega un flujo de despliegue con GitHub Actions:
   - Crea `.github/workflows/deploy.yml` con un workflow que ejecute `npm run build` y publique la carpeta `dist/` en la rama `gh-pages` usando `peaceiris/actions-gh-pages` o `actions/deploy-pages`.
4. En GitHub:
   - Ve a **Settings → Pages**.
   - Selecciona **Source** = `GitHub Actions` y guarda.
5. Cada vez que hagas push a `main`, el workflow publicará el sitio en `https://TU_USUARIO.github.io/contabilidad-personal/`.

**Limitación:** GitHub Pages solo sirve archivos estáticos. El frontend debe consumir la API hospedada en otro servicio.

---

## 4. Alojar el backend gratis (Render como ejemplo)
1. Crea una cuenta gratuita en [https://render.com/](https://render.com/).
2. En el panel, selecciona **New → Web Service**.
3. Conecta tu repositorio de GitHub (`contabilidad-personal`). Render detectará los subdirectorios.
4. Configura:
   - **Root directory**: `backend`
   - **Build command**: `npm install`
   - **Start command**: `npm run start` (o el script que definas, p.ej. `node dist/server.js` si transpila).
   - **Environment**: Node 18+.
   - Añade las variables de entorno (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) en la sección **Environment Variables**.
   - Plan gratuito (Free).
5. Al desplegar, Render asignará un dominio (`https://backend-contabilidad.onrender.com`). Usa ese dominio en `VITE_API_BASE_URL` para el frontend.
6. Habilita el autosleep (por defecto en plan free) y configura un chequeo de salud si ofrecen la opción.

**Alternativas gratuitas**:
- **Railway.app** (cuota mensual gratuita limitada).
- **Fly.io** (requiere tarjeta pero tiene créditos free). Configura una máquina ligera.
- **Cloudflare Workers / Pages Functions** (si reescribes la API sin dependencias nativas).
- **Supabase Edge Functions** (ideal para lógica ligera, pero implicaría reestructurar la API). 

---

## 5. Flujo de trabajo recomendado
1. Desarrolla localmente (frontend y backend) con tus variables `.env` configuradas.
2. Ejecuta los tests/lints básicos (`npm run lint`, `npm run test` si los defines).
3. Realiza commits pequeños y descriptivos; sube cambios al repositorio principal.
4. Verifica `Actions` en GitHub para ver el estado del despliegue de la SPA.
5. Comprueba el backend en Render (logs y health endpoint).
6. Ajusta `VITE_API_BASE_URL` si cambia la URL del backend.

---

## 6. Consejos finales
- Mantén tus claves `service_role` y `JWT secret` fuera del repositorio (solo en `.env`).
- Activa la autenticación de dos factores en GitHub, Supabase y el proveedor de hosting.
- Programa backups en Supabase (Settings → Backups).
- Revisa periódicamente los logs de Supabase (Auth y Postgres) para detectar errores o accesos inusuales.
- Cuando el proyecto crezca, considera mover el backend a un plan pago para evitar latencias por cold start.

Con esta guía tendrás todo lo necesario para trabajar con control de versiones, autenticación Supabase y despliegue gratuito tanto del frontend como del backend. Ajusta los comandos según el framework o herramientas específicas que adoptes en cada parte del proyecto.
