// Almacenamiento en Supabase (tablas en supabase/schema.sql) usando su API REST.
// Usa la llave service_role: este archivo solo corre en el servidor.
import crypto from 'node:crypto';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

async function rest(ruta, { method = 'GET', body, prefer } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${ruta}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(prefer && { Prefer: prefer }),
    },
    body: body && JSON.stringify(body),
  });
  const texto = await res.text(); // un insert sin "return=representation" responde 201 sin cuerpo
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const q = encodeURIComponent;

export function crearVarias(lista) {
  if (!lista.length) return [];
  const filas = lista.map((datos) => ({ id: crypto.randomUUID().slice(0, 8), ...datos }));
  return rest('invitaciones', { method: 'POST', body: filas, prefer: 'return=representation' });
}

export async function actualizar(id, cambios) {
  const [inv] = await rest(`invitaciones?id=eq.${q(id)}`, {
    method: 'PATCH',
    body: { ...cambios, actualizado: new Date().toISOString() },
    prefer: 'return=representation',
  });
  return inv ?? null;
}

export const listar = () => rest('invitaciones?order=creado.asc,id.asc');
export const porId = async (id) => (id ? (await rest(`invitaciones?id=eq.${q(id)}`))[0] : undefined);
export const porWamid = async (wamid) => (wamid ? (await rest(`invitaciones?wamid=eq.${q(wamid)}`))[0] : undefined);
export const eliminarTodas = () => rest('invitaciones?id=not.is.null', { method: 'DELETE' });

// Mensaje editable del envío manual; null = usar el predeterminado
export async function leerMensaje() {
  const [fila] = await rest('configuracion?clave=eq.mensaje');
  return fila?.valor ?? null;
}

export const guardarMensaje = (texto) =>
  rest('configuracion', {
    method: 'POST',
    body: { clave: 'mensaje', valor: texto },
    prefer: 'resolution=merge-duplicates',
  });
