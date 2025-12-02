# Guia de Uso del Sistema de Contabilidad

## 1. Panorama general
- **Objetivo**: centralizar el registro de ingresos y gastos en cordobas (C$) con equivalentes automaticos en dolares (USD).
- **Tecnologias clave**: React + Vite en el frontend, Supabase para autenticacion, API REST para operaciones financieras, exportacion mediante ExcelJS y jsPDF.
- **Roles previstos**: usuarios operativos para registrar movimientos y administradores para revisar reportes, gestionar categorias y usuarios.

## 2. Autenticacion y recuperacion de contrasena
1. **Inicio de sesion**: ingresar correo y contrasena. Tras cinco intentos fallidos se activa un bloqueo temporal con mensaje explicativo y acceso directo al flujo de recuperacion.
2. **Solicitud de cambio**: en la pagina *Perfil* pulsa `Solicitar cambio de contrasena`. El sistema envia un correo con enlace seguro (gestionado por Supabase).
3. **Proceso de restablecimiento**: abre el enlace recibido, establece la nueva contrasena y regresa a la aplicacion. El enlace expira despues de un uso o de un periodo limitado.

## 3. Registro de movimientos
### 3.1 Ingresos
- Accede a **Ingresos**.
- Usa `Agregar ingreso` para describir el movimiento:
  - **Categoria**: clasifica el ingreso (por ejemplo Ventas, Servicios).
  - **Origen**: efectivo o cuenta bancaria.
  - **Importe y moneda**: admite C$ y USD. El sistema convierte automaticamente al otro tipo de cambio vigente (36.7).
  - **Nota opcional**: detalles adicionales.
- Guarda el registro. Se actualiza el balance y queda disponible en los reportes.

### 3.2 Gastos
- Accede a **Gastos** y repite el flujo anterior.
- Utiliza categorias especificas (por ejemplo Insumos, Servicios publicos) para mejorar la visualizacion en reportes.

### 3.3 Categorias
- Los administradores pueden crear o editar categorias en *Administracion > Categorias*.
- Cada movimiento debe asociarse a una categoria; los nombres se reflejan en Dashboard, Balance y Reportes.

## 4. Paneles y reportes
### 4.1 Dashboard
- Resumen de los ultimos 15 dias con grafico de barras (ingresos en C$) y grafico de dona para la distribucion de gastos.
- Tarjetas clave muestran totales y balances en C$ con equivalentes USD.
- Para administradores se incluye conteo de usuarios activos.

### 4.2 Balance
1. Selecciona un rango de fechas o un mes desde los chips superiores.
2. Se muestran tarjetas con ingresos, gastos y resultado principal en C$.
3. La seccion *Movimientos mensuales* detalla saldo inicial, ingresos, gastos, resultado y arrastre; cada valor presenta la cifra principal en C$ y una referencia en USD.
4. Usa los botones de mes para ajustar el rango rapidamente.

### 4.3 Reportes
#### Filtros y datasets
- Elige entre `Ingresos`, `Gastos` o `Balance` desde las pestanas superiores.
- Ajusta el rango de fechas o selecciona un mes preconfigurado.
- Pulsa `Actualizar` para consultar.

#### Tabla y resumenes
- En ingresos/gastos se listan los movimientos con notas, origen y montos en su moneda de origen.
- En balance se presentan columnas en C$ con equivalentes en USD. Los resumenes resaltan totales por moneda y muestran las equivalencias cruzadas.

#### Exportacion
1. **Excel (`Exportar Excel`)**
   - Genera tablas estilo contable con filtros y filas alternadas.
   - Para ingresos/gastos incluye columnas de conversion (C$/USD) y un resumen de totales.
   - Para balance crea tablas con C$ como moneda principal y una seccion resumen con ambas divisas.
2. **PDF (`Exportar PDF`)**
   - Usa un layout apaisado. Las tablas repiten la informacion clave de la vista.
   - Incluye resumen textual al final con totales y equivalencias.
3. Los archivos se nombran con el dataset y el rango seleccionado (`reporte-balance-YYYY-MM-DD_a_YYYY-MM-DD`).

## 5. Buenas practicas de operacion
- Registrar los movimientos el mismo dia para mantener coherencia con los filtros por fecha.
- Mantener la lista de categorias organizada y sin duplicados.
- Verificar el tipo de cambio configurado (36.7) antes de cierres mensuales; si cambia, coordinar la actualizacion con el equipo de desarrollo.
- Despues de exportar, compartir los archivos mediante canales seguros (por ejemplo correo corporativo o repositorio interno).

## 6. Preguntas frecuentes
- **Por que aparece un equivalente en USD si trabajo en C$?** Para auditorias o comparativos en moneda extranjera. La moneda base del sistema es C$.
- **El enlace de recuperacion no llega?** Revisa spam y espera hasta 5 minutos. Si persiste, solicita uno nuevo desde Perfil.
- **Puedo cambiar la moneda base?** No desde la interfaz. Requiere ajustes en el codigo y en los reportes.

## 7. Contacto y escalamiento
- **Soporte funcional**: equipo de contabilidad o administradores asignados.
- **Soporte tecnico**: levanta un ticket en el canal interno especificando modulo, fecha y detalles del problema.

---
Esta guia se actualizara conforme se agreguen nuevas funcionalidades (por ejemplo ajustes automaticos de tipo de cambio o reportes adicionales). Mantener la version impresa o digital a la mano para capacitaciones y auditorias.
