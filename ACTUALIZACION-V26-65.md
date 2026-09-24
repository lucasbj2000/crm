# ICIIA V26.65 · Diseño y navegación

## Cambios

- Estilo común para navegación, indicadores, tablero, formularios, tablas, botones y ventanas. Se mantienen los colores, logos y nombres configurados por empresa.
- Controles táctiles de al menos 44 px, campos móviles de 16 px, ajustes para áreas seguras y preferencias de movimiento reducido.
- Conversación móvil despejada; se conservan las restricciones anteriores sobre IA, respuestas rápidas y herramientas secundarias.
- Se evita duplicar la navegación y el tablero cuando está disponible la bandeja móvil.
- Contactos se inserta en el grupo correcto del menú y participa del cambio de vistas. El acceso desde la navegación móvil reconoce el módulo.
- La sincronización del perfil no modifica el DOM cuando los datos no cambian. El observador de la conversación vigila solo el drawer.
- Caché PWA renovada y prueba de regresión incorporada al despliegue.

## Validación

Pruebas Node de perfil, navegación agrupada, recursos PWA, drawer, composición móvil y flujo funcional de clientes/sucursales/formularios. Revisión con Chromium en una instancia aislada, datos ficticios y WhatsApp simulado: escritorio de 1440 px, conversación de 360/390/768 px y navegación por once módulos en escritorio/móvil.

Las pruebas locales no verifican el envío a WhatsApp real ni sustituyen la comprobación del VPS después del despliegue. No se modifican el esquema de datos, permisos, credenciales ni sesiones de WhatsApp.

## Hostinger

Usar el SHA completo confirmado de esta actualización como argumento del script oficial `scripts/deploy-vps.sh`. El script prepara una versión aislada, conserva el almacenamiento persistente, valida el servicio y mantiene una versión anterior para recuperación.

La publicación en GitHub no actualiza por sí sola el VPS. Confirmar `DESPLIEGUE COMPLETADO`, el commit esperado, PM2 online y la carga del CRM por HTTPS. Después recargar la aplicación para recibir los nuevos estilos.
