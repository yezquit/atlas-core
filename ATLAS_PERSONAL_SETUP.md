# Atlas Personal V2 — guía local

Atlas Personal usa un único usuario configurable, una cookie de sesión firmada y persistencia local en `.atlas-data/`. No necesita autenticación, base de datos ni despliegue externos.

## Variables privadas

1. Copia `.env.example` como `.env.local`.
2. Ejecuta `npm run auth:configure -- tu_usuario` desde una terminal interactiva.
3. Escribe una contraseña de al menos 12 caracteres. El asistente no la muestra ni la guarda.
4. Copia las tres líneas generadas a `.env.local`: usuario, hash scrypt y secreto de sesión.
5. Completa las claves deportivas que ya utilice Atlas. Todas deben permanecer sin prefijo `NEXT_PUBLIC_`.

No compartas `.env.local`, no lo copies a repositorios y no pegues sus valores en reportes. Cambiar `ATLAS_SESSION_SECRET` invalida todas las sesiones existentes. La duración predeterminada es siete días y puede ajustarse con `ATLAS_SESSION_TTL_SECONDS` entre una hora y treinta días.

## macOS

Requisitos: Node.js 20.9 o posterior y npm.

```bash
npm ci
cp .env.example .env.local
npm run auth:configure -- tu_usuario
npm run build
npm run start:lan
```

Después de copiar la configuración generada a `.env.local`, reinicia el servidor. Abre `http://localhost:3000` en el Mac.

Para conocer la IP Wi-Fi del Mac ejecuta:

```bash
ipconfig getifaddr en0
```

Si no devuelve una dirección, consulta Ajustes del Sistema → Wi-Fi → Detalles. En el iPhone o iPad conectado al mismo Wi-Fi abre `http://IP_DEL_MAC:3000`. Si macOS pregunta, permite conexiones entrantes a Node. La cookie no usa `Secure` bajo HTTP LAN porque los navegadores la rechazarían; sí lo activa automáticamente bajo HTTPS.

## Windows

1. Instala Node.js 20.9 o posterior.
2. Clona o copia el proyecto sin incluir `node_modules` ni `.next`.
3. Copia `.env.local` por un canal privado, o genera una configuración nueva con `npm run auth:configure -- tu_usuario`.
4. Para conservar el historial, copia completa la carpeta `.atlas-data` al directorio raíz del proyecto. Los archivos NDJSON son compatibles; no los edites ni fusiones manualmente.
5. Ejecuta `npm ci`, `npm run build` y `npm run start:lan` en PowerShell o Windows Terminal.
6. Obtén la dirección IPv4 con `ipconfig` y abre `http://IP_DEL_PC:3000` desde otro dispositivo de la misma LAN.
7. Si Windows Defender Firewall pregunta, permite Node.js únicamente en redes **privadas**, no públicas.

No abras el puerto 3000 en el router. Para acceso remoto privado, la siguiente etapa recomendada es Tailscale; no está instalado ni configurado en esta versión.

## Desarrollo y producción local

- Desarrollo: `npm run dev` o `npm run dev:lan`.
- Uso diario estable: `npm run build` seguido de `npm run start:lan`.

`start:lan` escucha en todas las interfaces del equipo, pero no publica Atlas en Internet por sí solo. La seguridad de la red local, el firewall y la ausencia de port forwarding siguen siendo responsabilidad del equipo anfitrión.

## Datos y copia de seguridad

Los registros se almacenan en `.atlas-data/v1/`, que Git ignora. Los registros nuevos incluyen `owner_id: "personal"`; los anteriores sin `owner_id` se interpretan como pertenecientes al mismo usuario. Para respaldar o mover Atlas, detén el servidor y copia `.atlas-data` completa.

## Cierre de sesión

Usa **Cerrar sesión** en la navegación. Atlas elimina la cookie HttpOnly del navegador. Si necesitas invalidar sesiones en todos los dispositivos, genera un nuevo `ATLAS_SESSION_SECRET`, actualiza `.env.local` y reinicia el servidor.
