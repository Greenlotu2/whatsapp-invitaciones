// Cliente mínimo de la WhatsApp Cloud API (Graph API de Meta).
const {
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  GRAPH_API_VERSION = 'v25.0',
  TEMPLATE_NAME = 'recordatorio_evento_v3',
  TEMPLATE_LANG = 'es_MX',
  DEFAULT_COUNTRY_CODE = '52',
  EVENT_TIMEZONE = 'America/Mexico_City',
} = process.env;

const URL = `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

// "222 123 4567" -> "522221234567". WhatsApp espera solo dígitos con lada de país.
export function normalizarTelefono(tel) {
  let d = String(tel ?? '').replace(/\D/g, '');
  if (d.length === 10) d = DEFAULT_COUNTRY_CODE + d;
  // Formato viejo de celulares de México (521 + 10 dígitos) -> 52 + 10 dígitos
  if (d.length === 13 && d.startsWith('521')) d = '52' + d.slice(3);
  return d.length >= 11 && d.length <= 15 ? d : null;
}

async function post(body) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = json.error ?? {};
    throw new Error(`${e.code ?? res.status}: ${e.error_data?.details ?? e.message ?? 'Error desconocido'}`);
  }
  return json.messages?.[0]?.id; // wamid
}

// "2026-10-05" -> "5 de octubre de 2026"
export function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
}

// "14:30" -> "2:30 p.m."
export function horaCorta(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

// Link de Google Calendar con el evento ya lleno
export function linkCalendario(inv) {
  const f = inv.fecha.replaceAll('-', '');
  const t = (hhmm) => hhmm.replace(':', '') + '00';
  return 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE',
    text: inv.evento,
    dates: `${f}T${t(inv.inicio)}/${f}T${t(inv.fin)}`,
    ctz: EVENT_TIMEZONE,
    location: inv.lugar,
  }).toString();
}

// Envía la plantilla aprobada (TEMPLATE_NAME):
// encabezado fijo; cuerpo {{1}} nombre, {{2}} evento, {{3}} fecha,
// {{4}} inicio, {{5}} fin, {{6}} lugar.
// Botones de respuesta rápida: 0 = Asistiré, 1 = No podré asistir.
// (Meta rechaza plantillas con link a Google Calendar; el link se manda al confirmar.)
export function enviarRecordatorio(inv) {
  const texto = (t) => ({ type: 'text', text: String(t || '-') });
  const boton = (index, payload) => ({
    type: 'button',
    sub_type: 'quick_reply',
    index: String(index),
    parameters: [{ type: 'payload', payload }],
  });

  return post({
    to: inv.telefono,
    type: 'template',
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANG },
      components: [
        {
          type: 'body',
          parameters: [
            inv.nombre,
            inv.evento,
            fechaLarga(inv.fecha),
            horaCorta(inv.inicio),
            horaCorta(inv.fin),
            inv.lugar,
          ].map(texto),
        },
        boton(0, `CONFIRMAR:${inv.id}`),
        boton(1, `RECHAZAR:${inv.id}`),
      ],
    },
  });
}

// Mensajes libres: solo se permiten dentro de las 24 h después de que la persona escribió.
export function enviarTexto(to, body) {
  return post({ to, type: 'text', text: { body } });
}

// Mensaje con botón que abre el link para agregar el evento al calendario
export function enviarCalendario(to, inv, body) {
  return post({
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: body },
      action: {
        name: 'cta_url',
        parameters: { display_text: 'Agregar a mi calendario', url: linkCalendario(inv) },
      },
    },
  });
}
