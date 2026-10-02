# Invitaciones por WhatsApp (Meta Cloud API)

Panel web para enviar invitaciones a eventos por WhatsApp de forma automática:

1. Capturas los datos del evento (nombre, fecha, hora, lugar).
2. Subes un CSV o Excel con `nombre` y `telefono`.
3. El sistema envía una plantilla aprobada a cada persona, con botones **Confirmar** / **No podré asistir**.
4. El webhook registra si el mensaje se entregó o se leyó y qué respondió cada persona, y le contesta de forma automática.

```
src/server.js     Servidor Express: panel, API, cola de envío y webhook
src/whatsapp.js   Llamadas a la Graph API (plantilla y texto)
src/store.js      Guarda las invitaciones en data/invitaciones.json
public/           Panel (index.html) y plantilla.csv de ejemplo
```

## 1. Configuración en Meta (una sola vez)

1. Entra a <https://developers.facebook.com/apps> → **Crear app** → tipo **Empresa** → agrega el producto **WhatsApp**.
2. En **WhatsApp → Configuración de la API**:
   - Copia el **Identificador del número de teléfono** → `WHATSAPP_PHONE_NUMBER_ID`.
   - Para pruebas puedes usar el número de prueba y el token temporal (dura 24 h). Agrega tu celular en "Para" como destinatario de prueba.
3. **Token permanente** (producción): Business Manager → Configuración del negocio → **Usuarios del sistema** → crear usuario admin → Asignar activos (la app y la cuenta de WhatsApp) → **Generar token** con los permisos `whatsapp_business_messaging` y `whatsapp_business_management` → `WHATSAPP_TOKEN`.
4. **Clave secreta**: Configuración de la app → Básica → Clave secreta → `META_APP_SECRET`.
5. Agrega un número real y un método de pago en la cuenta de WhatsApp Business para salir del modo de prueba.

### Plantilla del mensaje

WhatsApp solo permite iniciar conversaciones con **plantillas aprobadas**. En el **Administrador de WhatsApp → Plantillas de mensajes → Crear plantilla**:

- **Categoría:** Marketing (o Utilidad si la invitación es para empleados o clientes que ya tienen una relación contigo)
- **Nombre:** `invitacion_evento`
- **Idioma:** Español (MEX) → `es_MX`
- **Cuerpo:**

  ```
  Hola {{1}}, te invitamos a *{{2}}*.

  Fecha: {{3}}
  Hora: {{4}}
  Lugar: {{5}}

  ¿Nos confirmas tu asistencia?
  ```

  Ejemplos para la revisión: `Ana`, `Junta anual`, `viernes 16 de octubre`, `10:00 a.m.`, `Sala de juntas`.
- **Botones → Respuesta rápida:** `Confirmar asistencia` (primero) y `No podré asistir` (segundo). El orden importa: el código usa el índice 0 para confirmar y el 1 para rechazar.

La aprobación suele tardar desde minutos hasta 24 horas. Si cambias el nombre o el idioma, ajusta `TEMPLATE_NAME` y `TEMPLATE_LANG` en `.env`.

## 2. Instalar y correr

```powershell
cd C:\Users\green\whatsapp-invitaciones
npm install
copy .env.example .env   # luego llena los valores
npm run dev
```

Abre <http://localhost:3000>. Si definiste `ADMIN_PASSWORD`, el usuario es `admin`.

## 3. Webhook (estados y respuestas)

Meta necesita una URL **pública con HTTPS** para avisar entregas, lecturas y respuestas.

- **En local:** usa un túnel, por ejemplo `cloudflared tunnel --url http://localhost:3000` o `ngrok http 3000`.
- **En producción:** despliega en un servidor que corra Node siempre (Railway, Render, un VPS). **No uses Vercel**: la cola de envío y el archivo JSON necesitan un proceso que se quede corriendo.

En la app de Meta → **WhatsApp → Configuración → Webhook**:

- URL de devolución de llamada: `https://TU-DOMINIO/webhook`
- Token de verificación: el mismo valor que pusiste en `WEBHOOK_VERIFY_TOKEN`
- Suscríbete al campo **messages**.

## Notas

- Los teléfonos de 10 dígitos reciben la lada `DEFAULT_COUNTRY_CODE` (52, México) de forma automática.
- La respuesta automática ("¡Gracias por confirmar!") se puede enviar porque la persona acaba de escribir, lo que abre la ventana de 24 h. Si dejas `REPLY_*` vacío, no se contesta.
- Meta cobra por conversación iniciada con plantilla (las de Marketing cuestan más que las de Utilidad). Además, los números nuevos tienen un límite de destinatarios distintos por día que sube conforme envías mensajes de calidad.
- Errores comunes: `132001` (la plantilla no existe o el idioma no coincide), `131026` (el número no tiene WhatsApp), `190` (el token expiró).
