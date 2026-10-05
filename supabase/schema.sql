-- Tablas del panel de invitaciones. Correr una vez en el SQL Editor del proyecto de Supabase.
-- Solo el servidor accede (con la llave service_role); RLS sin políticas bloquea todo lo demás.

create table if not exists invitaciones (
  id text primary key,
  nombre text not null,
  telefono text not null,
  evento text not null,
  fecha date not null,
  inicio text not null,
  fin text not null,
  lugar text not null,
  maps text not null default '',
  estado text not null default 'pendiente',   -- pendiente | enviado | entregado | leido | fallido
  respuesta text,                              -- null | confirmado | rechazado
  wamid text,
  error text,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists invitaciones_wamid on invitaciones (wamid);

create table if not exists configuracion (
  clave text primary key,
  valor text
);

alter table invitaciones enable row level security;
alter table configuracion enable row level security;
