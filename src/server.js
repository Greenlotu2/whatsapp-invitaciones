import express from 'express';
import crypto from 'node:crypto';
import * as store from './store.js';
import {
  MENSAJE_PREDETERMINADO, VARIABLES, enviarCalendario, enviarRecordatorio, enviarTexto, linkWhatsApp, mensajeManual, normalizarTelefono,
} from './whatsapp.js';

const {
  PORT = 3000,
  ADMIN_PASSWORD,
  META_APP_SECRET,
  WEBHOOK_VERIFY_TOKEN,
  REPLY_CONFIRMADO,
  REPLY_RECHAZADO,
} = process.env;

const app = express();
// Guardamos el cuerpo crudo para validar la firma del webhook
app.use(express.json({ limit: '5mb', verify: (req, _res, buf) => (req.rawBody = buf) }));

/* ------------------------------------------------------------------ */
/* Webhook de Meta (público, protegido por firma)                      */
/* ------------------------------------------------------------------ */

// Verificación inicial cuando configuras el webhook en Meta
app.get('/webhook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token && token === WEBHOOK_VERIFY_TOKEN) return res.send(challenge);
  res.sendStatus(403);
});

function firmaValida(req) {
  if (!META_APP_SECRET) return true; // sin secreto configurado no se valida (solo pruebas)
  const firma = req.get('x-hub-signature-256') ?? '';
  const esperada = 'sha256=' + crypto.createHmac('sha256', META_APP_SECRET).update(req.rawBody ?? '').digest('hex');
  return firma.length === esperada.length && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
}

const ORDEN_ESTADO = { pendiente: 0, enviado: 1, entregado: 2, leido: 3 };
const ESTADO_META = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };

app.post('/webhook', (req, res) => {
  if (!firmaValida(req)) return res.sendStatus(401);
  res.sendStatus(200); // Meta reintenta si no respondemos rápido

  for (const entry of req.body.entry ?? []) {
    for (const { value } of entry.changes ?? []) {
      // Estados de entrega: enviado / entregado / leído / fallido
      for (const s of value?.statuses ?? []) {
        const inv = store.porWamid(s.id);
        const nuevo = ESTADO_META[s.status];
        if (!inv || !nuevo) continue;
        if (nuevo === 'fallido') {
          store.actualizar(inv.id, { estado: 'fallido', error: s.errors?.[0]?.title ?? 'Falló la entrega' });
        } else if ((ORDEN_ESTADO[nuevo] ?? 0) > (ORDEN_ESTADO[inv.estado] ?? 0)) {
          // Los eventos pueden llegar desordenados; nunca retrocedemos de "leído" a "entregado"
          store.actualizar(inv.id, { estado: nuevo });
        }
      }

      // Respuestas a los botones de la plantilla
      for (const m of value?.messages ?? []) {
        if (m.type !== 'button') continue;
        const [accion, id] = String(m.button?.payload ?? '').split(':');
        const inv = store.porId(id) ?? store.porWamid(m.context?.id);
        if (!inv) continue;
        const respuesta = accion === 'CONFIRMAR' ? 'confirmado' : 'rechazado';
        store.actualizar(inv.id, { respuesta, estado: 'leido', error: null });
        // Al confirmar se manda el botón de calendario (Meta no lo permite dentro de la plantilla)
        const envio = respuesta === 'confirmado'
          ? enviarCalendario(m.from, inv, REPLY_CONFIRMADO || 'Gracias por confirmar.')
          : REPLY_RECHAZADO && enviarTexto(m.from, REPLY_RECHAZADO);
        envio?.catch((e) => console.error('Respuesta automática:', e.message));
      }
    }
  }
});

/* ------------------------------------------------------------------ */
/* Panel y API (protegidos con contraseña)                             */
/* ------------------------------------------------------------------ */

app.use((req, res, next) => {
  if (!ADMIN_PASSWORD) return next();
  const [, b64 = ''] = (req.get('authorization') ?? '').split(' ');
  const [user, pass] = Buffer.from(b64, 'base64').toString().split(':');
  if (user === 'admin' && pass === ADMIN_PASSWORD) return next();
  res.set('WWW-Authenticate', 'Basic realm="Invitaciones"').sendStatus(401);
});

app.use(express.static('public'));

const mensajeActual = () => store.leerMensaje() ?? MENSAJE_PREDETERMINADO;

app.get('/api/invitaciones', (_req, res) => {
  const plantilla = mensajeActual();
  res.json(store.listar().map((i) => ({ ...i, wa: linkWhatsApp(i, plantilla) })));
});

// Mensaje editable del envío manual
app.get('/api/mensaje', (_req, res) => {
  res.json({ texto: mensajeActual(), predeterminado: MENSAJE_PREDETERMINADO, variables: VARIABLES });
});

app.put('/api/mensaje', (req, res) => {
  const texto = String(req.body?.texto ?? '').replace(/\r\n/g, '\n').trim();
  if (!texto) return res.status(400).json({ error: 'El mensaje no puede quedar vacío.' });
  if (texto.length > 3000) return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 3000 caracteres).' });
  store.guardarMensaje(texto === MENSAJE_PREDETERMINADO ? null : texto);
  res.json({ ok: true });
});

// Vista previa con los datos del evento capturados en el panel
app.post('/api/mensaje/vista-previa', (req, res) => {
  const { texto, evento = {} } = req.body ?? {};
  const inv = {
    nombre: 'Ana López',
    evento: evento.evento || 'Nombre del evento',
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(evento.fecha ?? '') ? evento.fecha : '2026-10-09',
    inicio: evento.inicio || '17:00',
    fin: evento.fin || '19:00',
    lugar: evento.lugar || 'Lugar del evento',
    maps: evento.maps || '',
  };
  res.json({ texto: mensajeManual(inv, String(texto ?? '')) });
});

// Envío manual: el panel marca "enviado" al abrir WhatsApp y registra la respuesta a mano
app.patch('/api/invitaciones/:id', (req, res) => {
  const { estado, respuesta } = req.body ?? {};
  const cambios = {};
  if (['pendiente', 'enviado'].includes(estado)) cambios.estado = estado;
  if ([null, 'confirmado', 'rechazado'].includes(respuesta)) cambios.respuesta = respuesta;
  if (respuesta && store.porId(req.params.id)?.estado === 'pendiente') cambios.estado = 'enviado'; // si respondió, ya se le envió
  const inv = store.actualizar(req.params.id, cambios);
  inv ? res.json(inv) : res.sendStatus(404);
});

// Cola de envío: uno por uno con una pausa para no saturar la API
const cola = [];
let enviando = false;
async function procesarCola() {
  if (enviando) return;
  enviando = true;
  while (cola.length) {
    const inv = cola.shift();
    try {
      const wamid = await enviarRecordatorio(inv);
      store.actualizar(inv.id, { estado: 'enviado', wamid, error: null });
    } catch (e) {
      store.actualizar(inv.id, { estado: 'fallido', error: e.message });
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  enviando = false;
}

// Valida las filas del CSV/Excel (nombre, teléfono) + los datos del evento, que son iguales para todos,
// y crea las invitaciones. Devuelve { error } o { creadas, rechazadas }.
function crearInvitaciones(body) {
  const { filas = [], evento: ev = {} } = body ?? {};
  const evento = {
    evento: String(ev.evento ?? '').trim(),
    fecha: String(ev.fecha ?? ''),
    inicio: String(ev.inicio ?? ''),
    fin: String(ev.fin ?? ''),
    lugar: String(ev.lugar ?? '').trim(),
    maps: String(ev.maps ?? '').trim(),
  };
  if (!evento.evento || !evento.lugar) return { error: 'Falta el nombre o el lugar del evento.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(evento.fecha)) return { error: 'Fecha inválida.' };
  if (!/^\d{2}:\d{2}$/.test(evento.inicio) || !/^\d{2}:\d{2}$/.test(evento.fin) || evento.fin <= evento.inicio) {
    return { error: 'La hora de fin debe ser posterior a la de inicio.' };
  }
  if (evento.maps && !/^https:\/\/\S+$/.test(evento.maps)) return { error: 'El link de Google Maps debe empezar con https://' };

  const creadas = [];
  const rechazadas = [];
  for (const [i, f] of filas.entries()) {
    const nombre = String(f.nombre ?? '').trim();
    const telefono = normalizarTelefono(f.telefono);
    const faltan = [!nombre && 'nombre', !telefono && 'celular válido'].filter(Boolean);
    if (faltan.length) {
      rechazadas.push({ fila: i + 2, motivo: `Falta: ${faltan.join(', ')}` });
      continue;
    }
    creadas.push(store.crear({ nombre, telefono, ...evento }));
  }
  return { creadas, rechazadas };
}

// Envío automático por la API (plantilla aprobada)
app.post('/api/enviar', (req, res) => {
  const r = crearInvitaciones(req.body);
  if (r.error) return res.status(400).json(r);
  cola.push(...r.creadas);
  procesarCola();
  res.json({ encoladas: r.creadas.length, rechazadas: r.rechazadas });
});

// Envío manual: solo crea la lista; cada mensaje se manda desde el panel con su link de WhatsApp
app.post('/api/cargar', (req, res) => {
  const r = crearInvitaciones(req.body);
  if (r.error) return res.status(400).json(r);
  res.json({ cargadas: r.creadas.length, rechazadas: r.rechazadas });
});

app.post('/api/reintentar', (_req, res) => {
  const fallidas = store.listar().filter((i) => i.estado === 'fallido');
  for (const inv of fallidas) store.actualizar(inv.id, { estado: 'pendiente', error: null });
  cola.push(...fallidas);
  procesarCola();
  res.json({ reintentadas: fallidas.length });
});

app.delete('/api/invitaciones', (_req, res) => {
  store.eliminarTodas();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Invitaciones WhatsApp en http://localhost:${PORT}`);
  if (!process.env.WHATSAPP_TOKEN) console.warn('Falta WHATSAPP_TOKEN en .env: los envíos fallarán.');
  if (!ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD vacío: el panel no tiene contraseña.');
});
