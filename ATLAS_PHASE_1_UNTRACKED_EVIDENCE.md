# Evidencia de resolución de elementos no versionados

Fecha: 2026-08-01  
Rama: `rescue/atlas-core-v0.2`

## Residuos eliminados

- `atlas-core@0.1.0`: archivo regular, tamaño 0 bytes, sin contenido ni funcionalidad.
- `next`: archivo regular, tamaño 0 bytes, sin contenido ni funcionalidad.

Ambos elementos estaban fuera de Git antes de la Fase 1. Su eliminación no produce por sí sola un diff versionable; este documento conserva la evidencia en el commit separado de limpieza.

## Rutas consolidadas

- `src/app/api/football/fixtures-by-league/route.js`: contiene carga de fixtures por ID de liga y temporada, pero duplica `fixtures/route.js`, usa valores por defecto inseguros, no valida entradas y devuelve errores crudos.
- `src/app/api/football/search-leagues/route.js`: contiene normalización básica de ligas, países y temporadas, pero duplica el catálogo/ruta `leagues`, consulta una búsqueda arbitraria y devuelve errores crudos.

La capacidad útil se migró a las rutas versionadas `fixtures` y `leagues`, con validación, timeout, caché y contratos sanitizados. La selección y el análisis usan fixture ID explícito mediante `fixture-analysis`. Las dos rutas duplicadas no versionadas fueron retiradas; no quedan archivos en esos directorios.
