// Cliente mínimo de la WhatsApp Cloud API (Graph API de Meta).
const {
  WHATSAPP_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  GRAPH_API_VERSION = 'v23.0',
  TEMPLATE_NAME = 'invitacion_evento',
  TEMPLATE_LANG = 'es_MX',
  DEFAULT_COUNTRY_CODE = '52',
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

// Envía la plantilla aprobada. Variables del cuerpo, en orden:
// {{1}} nombre, {{2}} evento, {{3}} fecha, {{4}} hora, {{5}} lugar.
// Botones de respuesta rápida: 0 = Confirmar, 1 = No podré asistir.
export function enviarInvitacion(inv) {
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
          parameters: [inv.nombre, inv.evento, inv.fecha, inv.hora, inv.lugar].map(texto),
        },
        boton(0, `CONFIRMAR:${inv.id}`),
        boton(1, `RECHAZAR:${inv.id}`),
      ],
    },
  });
}

// Texto libre: solo se permite dentro de las 24 h después de que la persona escribió.
export function enviarTexto(to, body) {
  return post({ to, type: 'text', text: { body } });
}
