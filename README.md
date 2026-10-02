# Recordatorios de eventos por WhatsApp (Meta Cloud API)

Panel web para enviar recordatorios de eventos por WhatsApp de forma automática:

1. Capturas los datos del evento (nombre, fecha, hora de inicio y fin, lugar).
2. Subes un Excel o CSV con `nombre` y `celular` (también se aceptan "Nombre completo", "Teléfono" y "WhatsApp").
3. El sistema envía una plantilla aprobada a cada persona, con botones **Asistiré** / **No podré asistir**.
4. El webhook registra si el mensaje se entregó o se leyó y qué respondió cada persona, y a quien confirma le manda el botón para agregar el evento a su calendario.

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

WhatsApp solo permite iniciar conversaciones con **plantillas aprobadas**. La plantilla  (Utilidad, es_MX) se creó por API:

- **Encabezado:** Recordatorio de evento
- **Cuerpo:**

  \- **Botones de respuesta rápida:**  (índice 0) y  (índice 1).

**Botón de calendario:** Meta rechaza (INVALID_FORMAT) las plantillas con un botón de link a Google Calendar. Por eso, cuando la persona toca *Asistiré*, el webhook le responde con un mensaje interactivo con el botón **Agregar a mi calendario**. Eso se permite porque la persona acaba de escribir.

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
