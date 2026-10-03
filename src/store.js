// Almacenamiento simple en un archivo JSON (data/invitaciones.json).
// Suficiente para cientos/miles de invitaciones; si crece, migrar a una base de datos.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = path.resolve('data');
const FILE = path.join(DATA_DIR, 'invitaciones.json');

let invitaciones = [];
if (fs.existsSync(FILE)) {
  invitaciones = JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function guardar() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(invitaciones, null, 2));
  fs.renameSync(tmp, FILE);
}

export function crear(datos) {
  const ahora = new Date().toISOString();
  const inv = {
    id: crypto.randomUUID().slice(0, 8),
    ...datos,
    estado: 'pendiente', // pendiente | enviado | entregado | leido | fallido
    respuesta: null, // null | confirmado | rechazado
    wamid: null,
    error: null,
    creado: ahora,
    actualizado: ahora,
  };
  invitaciones.push(inv);
  guardar();
  return inv;
}

export function actualizar(id, cambios) {
  const inv = invitaciones.find((i) => i.id === id);
  if (!inv) return null;
  Object.assign(inv, cambios, { actualizado: new Date().toISOString() });
  guardar();
  return inv;
}

export const listar = () => invitaciones;
export const porId = (id) => invitaciones.find((i) => i.id === id);
export const porWamid = (wamid) => invitaciones.find((i) => i.wamid === wamid);

export function eliminarTodas() {
  invitaciones = [];
  guardar();
}

// Mensaje editable del envío manual (data/mensaje.json); null = usar el predeterminado
const MENSAJE_FILE = path.join(DATA_DIR, 'mensaje.json');
let mensaje = fs.existsSync(MENSAJE_FILE) ? JSON.parse(fs.readFileSync(MENSAJE_FILE, 'utf8')).texto : null;

export const leerMensaje = () => mensaje;

export function guardarMensaje(texto) {
  mensaje = texto;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(MENSAJE_FILE, JSON.stringify({ texto }, null, 2));
}
