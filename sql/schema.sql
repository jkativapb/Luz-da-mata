-- ============================================================
-- CRM LuzDaMata — schema Supabase
-- Rode este script no SQL Editor do seu projeto Supabase.
-- ============================================================

-- Extensão para gerar UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- CONTATOS (compradores e revendedores)
-- ------------------------------------------------------------
create table if not exists contatos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  nome text not null,
  tipo text not null check (tipo in ('comprador', 'revendedor')),
  telefone text,
  email text,
  cidade text,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_contatos_owner on contatos(owner_id);
create index if not exists idx_contatos_tipo on contatos(tipo);

-- ------------------------------------------------------------
-- VISITAS / CONTATOS (agendamentos, presencial ou videoconferência)
-- ------------------------------------------------------------
create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  contato_id uuid references contatos(id) on delete set null,
  nome_lead text, -- usado quando ainda não é um contato convertido
  data_visita timestamptz not null default now(),
  tipo_contato text not null check (tipo_contato in ('presencial', 'videoconferencia')),
  convertido boolean not null default false,
  tipo_conversao text check (tipo_conversao in ('comprador', 'revendedor')),
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_visitas_owner on visitas(owner_id);
create index if not exists idx_visitas_contato on visitas(contato_id);
create index if not exists idx_visitas_data on visitas(data_visita);

-- ------------------------------------------------------------
-- PRODUTOS (catálogo LuzDaMata)
-- ------------------------------------------------------------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  nome text not null,
  categoria text, -- ex: 'Estética', 'Fitoterápico'
  preco numeric(10,2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create index if not exists idx_produtos_owner on produtos(owner_id);

-- ------------------------------------------------------------
-- VENDAS
-- ------------------------------------------------------------
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  contato_id uuid not null references contatos(id) on delete cascade,
  data_venda timestamptz not null default now(),
  forma_pagamento text,
  observacoes text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_vendas_owner on vendas(owner_id);
create index if not exists idx_vendas_contato on vendas(contato_id);
create index if not exists idx_vendas_data on vendas(data_venda);

-- ------------------------------------------------------------
-- ITENS DE VENDA
-- ------------------------------------------------------------
create table if not exists itens_venda (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  produto_nome text not null, -- guarda o nome no momento da venda
  quantidade integer not null default 1,
  valor_unitario numeric(10,2) not null default 0
);

create index if not exists idx_itens_venda on itens_venda(venda_id);

-- ------------------------------------------------------------
-- Trigger para manter atualizado_em em contatos
-- ------------------------------------------------------------
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contatos_atualizado on contatos;
create trigger trg_contatos_atualizado
  before update on contatos
  for each row execute function set_atualizado_em();

-- ============================================================
-- RLS — cada usuário só vê e edita os próprios dados
-- ============================================================
alter table contatos enable row level security;
alter table visitas enable row level security;
alter table produtos enable row level security;
alter table vendas enable row level security;
alter table itens_venda enable row level security;

create policy "contatos_owner_all" on contatos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "visitas_owner_all" on visitas
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "produtos_owner_all" on produtos
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "vendas_owner_all" on vendas
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "itens_venda_owner_all" on itens_venda
  for all using (
    exists (select 1 from vendas v where v.id = itens_venda.venda_id and v.owner_id = auth.uid())
  ) with check (
    exists (select 1 from vendas v where v.id = itens_venda.venda_id and v.owner_id = auth.uid())
  );

-- ============================================================
-- Seed inicial de produtos do catálogo (pode editar depois no app)
-- ============================================================
-- Obs: rode este bloco DEPOIS de logar ao menos uma vez, e troque
-- 'auth.uid()' abaixo continua funcionando pois roda como o próprio usuário
-- caso você rode via SQL Editor logado, ajuste owner_id manualmente se precisar.

insert into produtos (owner_id, nome, categoria, preco) values
  (auth.uid(), 'Sérum Facial / Gel Mulateiro', 'Estética', 0),
  (auth.uid(), 'Demaquilante de Limpeza Facial', 'Estética', 0),
  (auth.uid(), 'Creme Hidratante Corporal Mulateiro', 'Estética', 0),
  (auth.uid(), 'Óleo Clareador Corporal', 'Estética', 0),
  (auth.uid(), 'Desodorante Natural RollOn', 'Estética', 0),
  (auth.uid(), 'Protetor Solar 50 FPS', 'Estética', 0),
  (auth.uid(), 'Protetor Solar 80 FPS Stick', 'Estética', 0),
  (auth.uid(), 'Fitoterápico Apuí', 'Fitoterápico', 0),
  (auth.uid(), 'Fitoterápico Samaúma', 'Fitoterápico', 0),
  (auth.uid(), 'Fitoterápico Mulateiro', 'Fitoterápico', 0),
  (auth.uid(), 'Fitoterápico Imburana de Cheiro', 'Fitoterápico', 0),
  (auth.uid(), 'Fitoterápico João Brandinho', 'Fitoterápico', 0),
  (auth.uid(), 'Fitoterápico Pau d''Arco', 'Fitoterápico', 0),
  (auth.uid(), 'As 9 Plantas', 'Fitoterápico', 0)
on conflict do nothing;
