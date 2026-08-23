# Atlas Personal V2

Atlas es una aplicación local de análisis deportivo y apoyo a decisiones. Su principio es **“Comprender antes de decidir”**: no es un tipster, no promete ganancias y no inventa probabilidades.

## Inicio rápido

Requiere Node.js 20.9 o posterior.

```bash
npm ci
cp .env.example .env.local
npm run auth:configure -- tu_usuario
npm run build
npm run start
```

El asistente de autenticación genera un hash de contraseña y un secreto de sesión. Copia su salida a `.env.local`; ese archivo está excluido de Git. Completa también las variables server-side del proveedor deportivo que ya utilice tu instalación.

Abre `http://localhost:3000`. Para usar Atlas desde otro dispositivo de la misma red local, consulta [ATLAS_PERSONAL_SETUP.md](./ATLAS_PERSONAL_SETUP.md).

## Comandos

- `npm run dev`: desarrollo solo en el equipo local.
- `npm run dev:lan`: desarrollo visible en la LAN.
- `npm run build`: compilación de producción.
- `npm run start`: producción solo en el equipo local.
- `npm run start:lan`: producción visible en la LAN.
- `npm test`: suite completa sin llamadas deportivas externas.
- `npm run lint`: análisis estático.

Los datos se guardan bajo `.atlas-data/v1/` mediante rutas construidas con APIs multiplataforma de Node. No publiques el puerto en Internet ni abras puertos del router.
