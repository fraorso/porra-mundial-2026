# Porra Mundial 2026

Aplicacion web completa para gestionar una porra del Mundial de Futbol 2026 usando como fuente de verdad los dos Excel indicados:

- `ADMIN-Excel-Mundial-2026 (2).xlsx`
- `Excel-Mundial-2026 (2).xlsx`

La semilla inicial en `database/seed.json` se ha generado desde esos ficheros: equipos, calendario, fases, reglas de puntuacion y predicciones especiales.

## Funcionalidades

- Login y registro configurable.
- Admin protegido con importacion de Excel, recalculo, logs, exportacion CSV y fecha limite.
- Bloqueo automatico de pronosticos por fecha/hora del primer partido.
- Pronosticos de todos los partidos del torneo.
- Ranking en tiempo real.
- Actualizacion automatica/manual de resultados con proveedor configurable.
- Persistencia JSON en `database/app-db.json`.
- Frontend responsive tipo dashboard deportivo.

## Instalacion

```bash
npm install
cp .env.example .env
npm run dev
```

Abre:

```text
http://localhost:3000
```

Credenciales iniciales:

```text
admin@porra.local
admin123
```

Cambia `JWT_SECRET`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `.env` antes de usarlo en produccion.

## Importar los Excel de nuevo

Desde terminal:

```bash
npm run import:excel -- "C:\Users\Javier\Downloads\ADMIN-Excel-Mundial-2026 (2).xlsx" "C:\Users\Javier\Downloads\Excel-Mundial-2026 (2).xlsx"
```

O desde el panel Admin, subiendo ambos archivos.

## Resultados reales

Por defecto `RESULTS_PROVIDER=mock`, por lo que no modifica resultados. Para Football-Data.org:

```env
RESULTS_PROVIDER=football-data
RESULTS_API_KEY=tu_api_key
RESULTS_POLL_MINUTES=15
```

El backend intenta emparejar los partidos por nombre de seleccion. Para APIs con nombres distintos, ajusta `backend/src/resultsProvider.js`.

## Reglas de puntuacion

Las reglas se importan desde la pestaña `ADMIN`, columna de reglas y puntos. En los Excel entregados los puntos aparecen configurados a `0`; la aplicacion conserva ese valor porque el Excel es la fuente de verdad. El panel admin permite cambiarlos sin tocar codigo.

## Estructura

```text
/frontend     SPA HTML/CSS/JS
/backend      API Node
/database     seed y base JSON persistente
/assets       recursos estaticos
/api          reservado para adaptadores de despliegue
/config       configuracion base
/scripts      importacion y smoke test
```

## Despliegue

Railway o VPS:

```bash
npm install
npm start
```

Render gratis:

1. Sube esta carpeta a un repositorio de GitHub.
2. En Render, crea `New > Web Service`.
3. Conecta el repositorio.
4. Render detectara `render.yaml`.
5. Pulsa `Deploy`.

El archivo `render.yaml` arranca la app con:

```bash
node backend/server.js
```

En el primer arranque se crean el administrador y 20 usuarios:

```text
admin@porra.local / admin123
usuario01@porra.local / Copa2026-01
...
usuario20@porra.local / Copa2026-20
```

Cuando Render te de una URL publica, sustituye `http://localhost:3000` en `database/invitaciones-simples.txt` por esa URL.

Vercel requiere adaptar Express a funcion serverless o desplegar frontend y API por separado. La app ya separa `/frontend` y `/backend`, por lo que esa migracion es directa.
