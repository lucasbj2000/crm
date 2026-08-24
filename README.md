# WhatsBot CRM V24

CRM centralizado para equipos comerciales con múltiples líneas de WhatsApp, sesiones QR independientes, formularios públicos y medición de respuestas.

## Cambios principales de V24

- Una conexión central por cada línea de WhatsApp, sin duplicar sesiones por sucursal.
- QR con fecha de generación, vencimiento, regeneración manual y reconexión progresiva.
- Acceso a líneas por usuario, incluso entre sucursales distintas.
- Formularios públicos mediante enlaces `/f/:token`.
- Respuestas web registradas dentro del módulo Formularios y vinculadas al cliente por WhatsApp cuando corresponde.
- Credencial inicial segura mediante variable de entorno; no hay contraseñas embebidas en el código.
- Despliegue reproducible con Docker Compose y actualización desde GitHub.

## Desarrollo local

Requiere Node.js 22 o superior.

```bash
cp .env.example .env
npm ci
npm run check
npm test
npm start
```

En desarrollo, `WHATSBOT_DATA_DIR` puede apuntar a una carpeta temporal. Para probar el QR sin conectar una cuenta real, usar `WHATSAPP_MOCK=1`.

## Producción en Hostinger VPS

1. Clonar el repositorio en `/opt/whatsbot-crm`.
2. Copiar `.env.example` como `.env` y definir una contraseña inicial fuerte y la URL pública real.
3. Ejecutar `docker compose up -d --build`.
4. Configurar OpenLiteSpeed como proxy inverso hacia `http://127.0.0.1:3030` y habilitar HTTPS.

El volumen Docker `whatsbot_crm_data` conserva base de datos, sesiones QR, archivos y configuración entre despliegues. Nunca debe borrarse durante una actualización.

## Despliegue continuo desde GitHub

El workflow `.github/workflows/deploy-hostinger.yml` se ejecuta al aprobar cambios en `main`. Requiere estos secretos del repositorio:

- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_USER`
- `HOSTINGER_SSH_KEY`
- `HOSTINGER_APP_PATH` (por ejemplo `/opt/whatsbot-crm`)

Las modificaciones se preparan en ramas y se integran mediante pull request. Producción solo recibe lo aprobado en `main`.

## Seguridad y respaldos

- No subir `.env`, `data/`, sesiones de WhatsApp, archivos multimedia ni respaldos a Git.
- Respaldar regularmente el volumen `whatsbot_crm_data`.
- Antes de restaurar, detener el contenedor para evitar escrituras simultáneas.
- Rotar cualquier contraseña o token que haya sido compartido fuera del gestor de secretos.
