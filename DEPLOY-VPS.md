# Método oficial para actualizar el CRM en el VPS

Este procedimiento actualiza el CRM desde la rama `main` de GitHub y mantiene
fuera del cambio todos los datos persistentes: empresas, usuarios, formularios,
sesiones y conexiones de WhatsApp, tokens y configuraciones guardadas.

## Dominio oficial

El dominio de producción del CRM es:

- CRM empresas: <https://iciia.online/login>
- Administrador Maestro: <https://iciia.online/master>

El certificado TLS vigente está emitido para `iciia.online` y `www.iciia.online`.
El hostname técnico de Hostinger no debe utilizarse como URL pública del CRM.

Si en el futuro cambia el dominio, el script permite sobrescribirlo mediante la
variable de entorno `CRM_DOMAIN`.

## Flujo para cada actualización

1. Realizar los cambios en una rama separada.
2. Ejecutar las pruebas del CRM.
3. Crear y revisar un Pull Request.
4. Fusionar el Pull Request con `main`.
5. Abrir la terminal del VPS y ejecutar:

   ```bash
   cd /opt/crm/crm-live
   bash scripts/deploy-vps.sh
   ```

6. Esperar el mensaje `DESPLIEGUE COMPLETADO`.
7. Abrir <https://iciia.online/> y actualizar con `Ctrl + F5`.

## Protecciones incluidas

- Comprueba que se está ejecutando como `root` y desde la instalación esperada.
- Exige que `storage` sea un enlace al almacenamiento persistente.
- Comprueba Node.js, Git, npm, PM2, espacio libre y el commit remoto.
- Clona la nueva versión en un directorio separado.
- Conserva el archivo `.env` sin mostrar su contenido.
- Instala dependencias y ejecuta las pruebas funcionales antes del cambio.
- Guarda la versión anterior en `/opt/crm/crm-live-backup-FECHA-HORA`.
- Reinicia únicamente `crm-v23-gateway`; no reinicia el VPS completo.
- Si el proceso no responde en el puerto 3030, restaura automáticamente la
  versión anterior y conserva la versión fallida para diagnóstico.
- Comprueba HTTPS local contra el dominio oficial `iciia.online`.

## Comprobación opcional de un commit específico

Para impedir que se despliegue una versión diferente a la aprobada, se puede
pasar el SHA completo como primer argumento:

```bash
cd /opt/crm/crm-live
bash scripts/deploy-vps.sh SHA_COMPLETO_APROBADO
```

El script se detiene sin modificar producción si `main` no coincide.

## Criterio de éxito

La actualización está completa solamente cuando aparecen estas tres señales:

- `DESPLIEGUE COMPLETADO` en la terminal.
- `crm-v23-gateway` figura `online` en PM2.
- El CRM abre por HTTPS en `https://iciia.online` y las pantallas principales
  cargan tras `Ctrl + F5`.

Los respaldos no se eliminan automáticamente. Esto evita borrar una versión
recuperable sin una revisión previa.
