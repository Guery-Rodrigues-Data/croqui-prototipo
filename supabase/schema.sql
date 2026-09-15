-- Schema do protótipo de Croqui no Supabase — substitui a sincronização via Google Sheets
-- (ver apps-script/sync.gs, mantido no repo só de referência/rollback).
-- Entidades: controladores (cadastro independente), croquis, ligação croqui<->controlador
-- (N:N, com posição local por croqui e flag virtual), grupos focais e anotações (1:N por
-- croqui). Rodar isto uma vez, direto no Postgres do projeto (SQL Editor do Supabase, ou
-- conexão direta com a senha do banco), pra recriar o schema do zero se precisar.

create table controladores (
  id text primary key,
  via text,
  lat double precision,
  lng double precision,
  fases integer,
  ciclo_segundos integer,
  estagio_atual integer,
  estagio_total integer,
  atualizado timestamptz not null default now()
);

create table croquis (
  id text primary key,
  nome text,
  lat double precision,
  lng double precision,
  area jsonb,
  atualizado timestamptz not null default now()
);

-- ligação N:N croqui <-> controlador (um controlador pode participar de vários croquis;
-- um croqui pode ter vários controladores). posicao_local é onde o pin aparece dentro
-- DESSE desenho especificamente; croqui_origem_id é preenchido só quando virtual=true
-- (controlador físico "mora" em outro croqui, esse é só uma referência).
create table croqui_controladores (
  id bigint generated always as identity primary key,
  croqui_id text not null references croquis(id) on delete cascade,
  controlador_id text not null references controladores(id) on delete cascade,
  posicao_local jsonb,
  virtual boolean not null default false,
  croqui_origem_id text references croquis(id),
  atualizado timestamptz not null default now(),
  unique (croqui_id, controlador_id)
);

create table grupos_focais (
  uid text primary key,
  id text,
  croqui_id text not null references croquis(id) on delete cascade,
  controlador_id text references controladores(id),
  tipo text not null,
  lat double precision,
  lng double precision,
  direcao text,
  rotation_deg integer,
  fase integer,
  arrow_scale numeric,
  pin_scale numeric,
  arrow_lat double precision,
  arrow_lng double precision,
  tem_repetidor boolean default false,
  repetidor_de text,
  atualizado timestamptz not null default now()
);

create table anotacoes (
  id text primary key,
  croqui_id text not null references croquis(id) on delete cascade,
  lat double precision,
  lng double precision,
  titulo text,
  texto text,
  rotation_deg integer,
  pin_scale numeric,
  atualizado timestamptz not null default now()
);

-- "atualizado" sempre gravado pelo SERVIDOR em toda atualização — não confia no cliente
-- mandar a hora certa (era a raiz dos bugs de corrida que tínhamos com o Sheets: registro
-- sem timestamp confiável revertia edição local pro estado antigo, mesmo sem F5).
create or replace function set_atualizado()
returns trigger as $$
begin
  new.atualizado = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_croquis_atualizado before update on croquis
  for each row execute function set_atualizado();
create trigger trg_controladores_atualizado before update on controladores
  for each row execute function set_atualizado();
create trigger trg_croqui_controladores_atualizado before update on croqui_controladores
  for each row execute function set_atualizado();
create trigger trg_grupos_focais_atualizado before update on grupos_focais
  for each row execute function set_atualizado();
create trigger trg_anotacoes_atualizado before update on anotacoes
  for each row execute function set_atualizado();

create index idx_croqui_controladores_croqui on croqui_controladores(croqui_id);
create index idx_croqui_controladores_controlador on croqui_controladores(controlador_id);
create index idx_grupos_focais_croqui on grupos_focais(croqui_id);
create index idx_anotacoes_croqui on anotacoes(croqui_id);

-- RLS: liberado pra leitura/escrita geral via a chave publicável, igual o Apps Script
-- "Anyone" de antes (protótipo interno, poucos testers, sem login de usuário ainda —
-- apertar depois quando tiver auth).
alter table croquis enable row level security;
alter table controladores enable row level security;
alter table croqui_controladores enable row level security;
alter table grupos_focais enable row level security;
alter table anotacoes enable row level security;

create policy "leitura publica" on croquis for select using (true);
create policy "escrita publica" on croquis for all using (true) with check (true);
create policy "leitura publica" on controladores for select using (true);
create policy "escrita publica" on controladores for all using (true) with check (true);
create policy "leitura publica" on croqui_controladores for select using (true);
create policy "escrita publica" on croqui_controladores for all using (true) with check (true);
create policy "leitura publica" on grupos_focais for select using (true);
create policy "escrita publica" on grupos_focais for all using (true) with check (true);
create policy "leitura publica" on anotacoes for select using (true);
create policy "escrita publica" on anotacoes for all using (true) with check (true);

-- Função que recebe o croqui completo (posições) e faz upsert + apaga o que sumiu, tudo
-- numa transação só no servidor — evita várias chamadas de ida-e-volta do cliente pra
-- diffar grupos/anotações/controladores adicionados ou removidos. Chamada pelo cliente
-- via supabaseClient.rpc('upsert_croqui_completo', {...}) — ver assets/supabase-sync.js.
create or replace function upsert_croqui_completo(
  p_id text,
  p_croqui jsonb,
  p_grupos jsonb,
  p_anotacoes jsonb,
  p_controladores jsonb
) returns timestamptz as $$
declare
  v_atualizado timestamptz;
begin
  insert into croquis (id, nome, lat, lng, area)
  values (
    p_id,
    p_croqui->>'nome',
    (p_croqui->>'lat')::double precision,
    (p_croqui->>'lng')::double precision,
    p_croqui->'area'
  )
  on conflict (id) do update set
    nome = excluded.nome,
    lat = excluded.lat,
    lng = excluded.lng,
    area = excluded.area
  returning atualizado into v_atualizado;

  delete from grupos_focais
  where croqui_id = p_id
    and uid not in (select x->>'uid' from jsonb_array_elements(p_grupos) x);

  insert into grupos_focais (
    uid, id, croqui_id, controlador_id, tipo, lat, lng, direcao,
    rotation_deg, fase, arrow_scale, pin_scale, arrow_lat, arrow_lng,
    tem_repetidor, repetidor_de
  )
  select
    x->>'uid', x->>'id', p_id, x->>'controladorId', x->>'tipo',
    (x->>'lat')::double precision, (x->>'lng')::double precision, x->>'direcao',
    (x->>'rotationDeg')::integer, (x->>'fase')::integer,
    (x->>'arrowScale')::numeric, (x->>'pinScale')::numeric,
    (x->>'arrowLat')::double precision, (x->>'arrowLng')::double precision,
    coalesce((x->>'temRepetidor')::boolean, false), x->>'repetidorDe'
  from jsonb_array_elements(p_grupos) x
  where x->>'uid' is not null
  on conflict (uid) do update set
    id = excluded.id,
    controlador_id = excluded.controlador_id,
    tipo = excluded.tipo,
    lat = excluded.lat,
    lng = excluded.lng,
    direcao = excluded.direcao,
    rotation_deg = excluded.rotation_deg,
    fase = excluded.fase,
    arrow_scale = excluded.arrow_scale,
    pin_scale = excluded.pin_scale,
    arrow_lat = excluded.arrow_lat,
    arrow_lng = excluded.arrow_lng,
    tem_repetidor = excluded.tem_repetidor,
    repetidor_de = excluded.repetidor_de;

  delete from anotacoes
  where croqui_id = p_id
    and id not in (select x->>'id' from jsonb_array_elements(p_anotacoes) x);

  insert into anotacoes (id, croqui_id, lat, lng, titulo, texto, rotation_deg, pin_scale)
  select
    x->>'id', p_id, (x->>'lat')::double precision, (x->>'lng')::double precision,
    x->>'titulo', x->>'texto', (x->>'rotationDeg')::integer, (x->>'pinScale')::numeric
  from jsonb_array_elements(p_anotacoes) x
  where x->>'id' is not null
  on conflict (id) do update set
    lat = excluded.lat,
    lng = excluded.lng,
    titulo = excluded.titulo,
    texto = excluded.texto,
    rotation_deg = excluded.rotation_deg,
    pin_scale = excluded.pin_scale;

  insert into controladores (id, via)
  select x->>'id', x->>'via'
  from jsonb_array_elements(p_controladores) x
  where x->>'id' is not null
  on conflict (id) do nothing;

  delete from croqui_controladores
  where croqui_id = p_id
    and controlador_id not in (select x->>'id' from jsonb_array_elements(p_controladores) x);

  insert into croqui_controladores (croqui_id, controlador_id, posicao_local, virtual, croqui_origem_id)
  select
    p_id, x->>'id', x->'posicaoLocal',
    coalesce((x->>'virtual')::boolean, false), x->>'croquiOrigemId'
  from jsonb_array_elements(p_controladores) x
  where x->>'id' is not null
  on conflict (croqui_id, controlador_id) do update set
    posicao_local = excluded.posicao_local,
    virtual = excluded.virtual,
    croqui_origem_id = excluded.croqui_origem_id;

  return v_atualizado;
end;
$$ language plpgsql security definer;

grant execute on function upsert_croqui_completo(text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;
