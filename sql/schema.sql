-- ============================================================
-- CRM LuzDaMata — schema canônico / sincronizado com o código
-- Supabase / PostgreSQL
--
-- IMPORTANTE: esta versão é idempotente e pode ser executada em
-- um projeto que já possui as tabelas. Ela adiciona as colunas
-- que faltavam sem apagar dados.
--
-- MODELO DE ACESSO:
-- CRM compartilhado pela equipe: todo usuário autenticado pode
-- consultar e editar os dados do CRM.
-- owner_id permanece como registro de autoria, não como filtro.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- CONTATOS / CLIENTES
-- ------------------------------------------------------------
create table if not exists contatos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  nome text not null,
  tipo text not null default 'cliente_final' check (tipo in ('cliente_final', 'revendedora', 'clinica', 'comprador', 'revendedor')),
  cpf text,
  cnpj text,
  telefone text,
  email text,
  instagram text,
  cidade text,
  estado text,
  bairro text,
  endereco text,
  cep text,
  numero text,
  complemento text,
  desconto_percentual numeric(5,2) not null default 0,
  data_ultimo_contato date,
  tipos_contato text[] not null default '{}',
  converteu_negocio boolean not null default false,
  aguardando_retorno boolean not null default true,
  data_proximo_contato date,
  observacoes text,
  ativo boolean not null default true,
  data_inativacao timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table contatos drop constraint if exists contatos_tipo_check;
alter table contatos add constraint contatos_tipo_check check (tipo in ('cliente_final', 'revendedora', 'clinica', 'comprador', 'revendedor'));
alter table contatos add column if not exists owner_id uuid references auth.users(id);
alter table contatos add column if not exists cpf text;
alter table contatos add column if not exists cnpj text;
alter table contatos add column if not exists instagram text;
alter table contatos add column if not exists estado text;
alter table contatos add column if not exists bairro text;
alter table contatos add column if not exists endereco text;
alter table contatos add column if not exists cep text;
alter table contatos add column if not exists numero text;
alter table contatos add column if not exists complemento text;
alter table contatos add column if not exists desconto_percentual numeric(5,2) default 0;
alter table contatos add column if not exists data_ultimo_contato date;
alter table contatos add column if not exists tipos_contato text[] default '{}';
alter table contatos add column if not exists converteu_negocio boolean default false;
alter table contatos add column if not exists aguardando_retorno boolean default true;
alter table contatos add column if not exists data_proximo_contato date;
alter table contatos add column if not exists ativo boolean default true;
alter table contatos add column if not exists data_inativacao timestamptz;
alter table contatos add column if not exists atualizado_em timestamptz default now();

-- Normaliza registros antigos quando possível.
update contatos set owner_id = auth.uid() where owner_id is null;
update contatos set tipo = 'cliente_final' where tipo = 'comprador';
update contatos set tipo = 'revendedora' where tipo = 'revendedor';
update contatos set desconto_percentual = 0 where desconto_percentual is null;
update contatos set tipos_contato = '{}' where tipos_contato is null;
update contatos set converteu_negocio = false where converteu_negocio is null;
update contatos set aguardando_retorno = true where aguardando_retorno is null;
update contatos set ativo = true where ativo is null;

create index if not exists idx_contatos_owner on contatos(owner_id);
create index if not exists idx_contatos_tipo on contatos(tipo);
create index if not exists idx_contatos_proximo_contato on contatos(data_proximo_contato);
create index if not exists idx_contatos_ativo on contatos(ativo);

-- ------------------------------------------------------------
-- VISITAS / AGENDA
-- ------------------------------------------------------------
create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  contato_id uuid references contatos(id) on delete set null,
  nome_lead text,
  data_visita timestamptz not null default now(),
  tipo_contato text not null default 'presencial' check (tipo_contato in ('presencial', 'videoconferencia')),
  convertido boolean not null default false,
  tipo_conversao text check (tipo_conversao in ('cliente_final', 'revendedora', 'clinica', 'comprador', 'revendedor')),
  observacoes text,
  lembrete_para text default 'cliente',
  telefone text,
  responsavel text,
  status text not null default 'agendado',
  data_anterior timestamptz,
  motivo_reagendamento text,
  motivo_cancelamento text,
  criado_em timestamptz not null default now()
);

alter table visitas add column if not exists owner_id uuid references auth.users(id);
alter table visitas add column if not exists lembrete_para text default 'cliente';
alter table visitas add column if not exists telefone text;
alter table visitas add column if not exists responsavel text;
alter table visitas add column if not exists status text default 'agendado';
alter table visitas add column if not exists data_anterior timestamptz;
alter table visitas add column if not exists motivo_reagendamento text;
alter table visitas add column if not exists motivo_cancelamento text;

update visitas set status = 'agendado' where status is null;

create index if not exists idx_visitas_owner on visitas(owner_id);
create index if not exists idx_visitas_contato on visitas(contato_id);
create index if not exists idx_visitas_data on visitas(data_visita);
create index if not exists idx_visitas_status on visitas(status);

-- ------------------------------------------------------------
-- PRODUTOS
-- ------------------------------------------------------------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  nome text not null,
  categoria text,
  preco numeric(10,2) not null default 0,
  preco_consumidor numeric(10,2) not null default 0,
  preco_profissional numeric(10,2) not null default 0,
  foto_url text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table produtos add column if not exists owner_id uuid references auth.users(id);
alter table produtos add column if not exists preco_consumidor numeric(10,2) default 0;
alter table produtos add column if not exists preco_profissional numeric(10,2) default 0;
alter table produtos add column if not exists foto_url text;

update produtos set preco_consumidor = coalesce(preco_consumidor, preco, 0) where preco_consumidor is null;
update produtos set preco_profissional = coalesce(preco_profissional, preco, 0) where preco_profissional is null;
update produtos set ativo = true where ativo is null;

create index if not exists idx_produtos_owner on produtos(owner_id);
create index if not exists idx_produtos_ativo on produtos(ativo);

-- ------------------------------------------------------------
-- VENDEDORES / EQUIPE
-- ------------------------------------------------------------
create table if not exists vendedores (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  nome text not null,
  telefone text,
  recebe_lembretes boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table vendedores add column if not exists owner_id uuid references auth.users(id);
alter table vendedores add column if not exists recebe_lembretes boolean default true;
alter table vendedores add column if not exists ativo boolean default true;

create index if not exists idx_vendedores_ativo on vendedores(ativo);

-- ------------------------------------------------------------
-- METAS MENSAIS
-- ------------------------------------------------------------
create table if not exists metas_mensais (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  mes date not null,
  valor_meta numeric(12,2) not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (mes)
);

alter table metas_mensais add column if not exists owner_id uuid references auth.users(id);
alter table metas_mensais add column if not exists valor_meta numeric(12,2) default 0;
alter table metas_mensais add column if not exists atualizado_em timestamptz default now();

create index if not exists idx_metas_mes on metas_mensais(mes);

-- ------------------------------------------------------------
-- VENDAS
-- ------------------------------------------------------------
create table if not exists vendas (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) default auth.uid(),
  contato_id uuid not null references contatos(id) on delete restrict,
  vendedor_id uuid references vendedores(id) on delete set null,
  vendedor_nome text,
  data_venda date not null default current_date,
  forma_pagamento text,
  situacao_pagamento text not null default 'pago',
  data_pagamento date,
  parcelamento text,
  parcelas_json jsonb not null default '[]'::jsonb,
  data_retorno_condicional date,
  desconto_venda numeric(10,2) not null default 0,
  nf_transmitida boolean not null default false,
  nf_cancelada boolean not null default false,
  observacoes text,
  criado_em timestamptz not null default now()
);

alter table vendas add column if not exists owner_id uuid references auth.users(id);
alter table vendas add column if not exists vendedor_id uuid references vendedores(id) on delete set null;
alter table vendas add column if not exists vendedor_nome text;
alter table vendas add column if not exists situacao_pagamento text default 'pago';
alter table vendas add column if not exists data_pagamento date;
alter table vendas add column if not exists parcelamento text;
alter table vendas add column if not exists parcelas_json jsonb default '[]'::jsonb;
alter table vendas add column if not exists data_retorno_condicional date;
alter table vendas add column if not exists desconto_venda numeric(10,2) default 0;
alter table vendas add column if not exists nf_transmitida boolean default false;
alter table vendas add column if not exists nf_cancelada boolean default false;

update vendas set situacao_pagamento = 'pago' where situacao_pagamento is null;
update vendas set parcelas_json = '[]'::jsonb where parcelas_json is null;
update vendas set desconto_venda = 0 where desconto_venda is null;
update vendas set nf_transmitida = false where nf_transmitida is null;
update vendas set nf_cancelada = false where nf_cancelada is null;

create index if not exists idx_vendas_owner on vendas(owner_id);
create index if not exists idx_vendas_contato on vendas(contato_id);
create index if not exists idx_vendas_data on vendas(data_venda);
create index if not exists idx_vendas_vendedor on vendas(vendedor_id);
create index if not exists idx_vendas_situacao on vendas(situacao_pagamento);

-- ------------------------------------------------------------
-- ITENS DE VENDA
-- ------------------------------------------------------------
create table if not exists itens_venda (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  produto_id uuid references produtos(id) on delete set null,
  produto_nome text not null,
  quantidade integer not null default 1,
  valor_unitario numeric(10,2) not null default 0,
  preco_base numeric(10,2) not null default 0,
  desconto_percentual numeric(5,2) not null default 0,
  tipo_cliente text default 'cliente_final',
  quantidade_vendida integer not null default 0,
  quantidade_devolvida integer not null default 0
);

alter table itens_venda add column if not exists preco_base numeric(10,2) default 0;
alter table itens_venda add column if not exists desconto_percentual numeric(5,2) default 0;
alter table itens_venda add column if not exists tipo_cliente text default 'cliente_final';
alter table itens_venda add column if not exists quantidade_vendida integer default 0;
alter table itens_venda add column if not exists quantidade_devolvida integer default 0;

update itens_venda set preco_base = coalesce(preco_base, valor_unitario, 0) where preco_base is null;
update itens_venda set desconto_percentual = 0 where desconto_percentual is null;
update itens_venda set quantidade_vendida = quantidade where quantidade_vendida is null or quantidade_vendida = 0;
update itens_venda set quantidade_devolvida = 0 where quantidade_devolvida is null;

create index if not exists idx_itens_venda on itens_venda(venda_id);
create index if not exists idx_itens_produto on itens_venda(produto_id);

-- ------------------------------------------------------------
-- TRIGGERS DE DATA DE ATUALIZAÇÃO
-- ------------------------------------------------------------
create or replace function set_atualizado_em()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contatos_atualizado on contatos;
create trigger trg_contatos_atualizado before update on contatos
for each row execute function set_atualizado_em();

drop trigger if exists trg_metas_atualizado on metas_mensais;
create trigger trg_metas_atualizado before update on metas_mensais
for each row execute function set_atualizado_em();

-- ------------------------------------------------------------
-- RLS — CRM COMPARTILHADO
-- Todos os usuários autenticados podem ver e editar o banco.
-- owner_id é mantido apenas para autoria/rastreabilidade.
-- ------------------------------------------------------------
alter table contatos enable row level security;
alter table visitas enable row level security;
alter table produtos enable row level security;
alter table vendedores enable row level security;
alter table metas_mensais enable row level security;
alter table vendas enable row level security;
alter table itens_venda enable row level security;

drop policy if exists contatos_owner_all on contatos;
drop policy if exists contatos_equipe_all on contatos;
create policy contatos_equipe_all on contatos
  for all to authenticated using (true) with check (true);

drop policy if exists visitas_owner_all on visitas;
drop policy if exists visitas_equipe_all on visitas;
create policy visitas_equipe_all on visitas
  for all to authenticated using (true) with check (true);

drop policy if exists produtos_owner_all on produtos;
drop policy if exists produtos_equipe_all on produtos;
create policy produtos_equipe_all on produtos
  for all to authenticated using (true) with check (true);

drop policy if exists vendedores_equipe_all on vendedores;
create policy vendedores_equipe_all on vendedores
  for all to authenticated using (true) with check (true);

drop policy if exists metas_equipe_all on metas_mensais;
create policy metas_equipe_all on metas_mensais
  for all to authenticated using (true) with check (true);

drop policy if exists vendas_owner_all on vendas;
drop policy if exists vendas_equipe_all on vendas;
create policy vendas_equipe_all on vendas
  for all to authenticated using (true) with check (true);

drop policy if exists itens_venda_owner_all on itens_venda;
drop policy if exists itens_venda_equipe_all on itens_venda;
create policy itens_venda_equipe_all on itens_venda
  for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- STORAGE — fotos de produtos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('produtos', 'produtos', true)
on conflict (id) do update set public = true;

drop policy if exists produtos_storage_select on storage.objects;
create policy produtos_storage_select on storage.objects
  for select to authenticated using (bucket_id = 'produtos');

drop policy if exists produtos_storage_insert on storage.objects;
create policy produtos_storage_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'produtos');

drop policy if exists produtos_storage_update on storage.objects;
create policy produtos_storage_update on storage.objects
  for update to authenticated using (bucket_id = 'produtos') with check (bucket_id = 'produtos');

drop policy if exists produtos_storage_delete on storage.objects;
create policy produtos_storage_delete on storage.objects
  for delete to authenticated using (bucket_id = 'produtos');

-- ------------------------------------------------------------
-- TRANSAÇÃO DE VENDA
-- Evita venda criada sem seus itens quando houver falha.
-- ------------------------------------------------------------
create or replace function salvar_venda(p_venda jsonb, p_itens jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(p_venda->>'id', '') is not null then
    v_id := (p_venda->>'id')::uuid;

    update vendas set
      contato_id = (p_venda->>'contato_id')::uuid,
      vendedor_id = nullif(p_venda->>'vendedor_id', '')::uuid,
      vendedor_nome = nullif(p_venda->>'vendedor_nome', ''),
      data_venda = (p_venda->>'data_venda')::date,
      forma_pagamento = nullif(p_venda->>'forma_pagamento', ''),
      situacao_pagamento = coalesce(nullif(p_venda->>'situacao_pagamento', ''), 'pago'),
      data_pagamento = nullif(p_venda->>'data_pagamento', '')::date,
      parcelamento = nullif(p_venda->>'parcelamento', ''),
      parcelas_json = coalesce(p_venda->'parcelas_json', '[]'::jsonb),
      data_retorno_condicional = nullif(p_venda->>'data_retorno_condicional', '')::date,
      desconto_venda = coalesce((p_venda->>'desconto_venda')::numeric, 0),
      nf_transmitida = coalesce((p_venda->>'nf_transmitida')::boolean, false),
      nf_cancelada = coalesce((p_venda->>'nf_cancelada')::boolean, false),
      observacoes = nullif(p_venda->>'observacoes', '')
    where id = v_id;

    if not found then
      raise exception 'Venda não encontrada.';
    end if;

    delete from itens_venda where venda_id = v_id;
  else
    insert into vendas (
      contato_id, vendedor_id, vendedor_nome, data_venda, forma_pagamento,
      situacao_pagamento, data_pagamento, parcelamento, parcelas_json,
      data_retorno_condicional, desconto_venda, nf_transmitida, nf_cancelada, observacoes
    ) values (
      (p_venda->>'contato_id')::uuid,
      nullif(p_venda->>'vendedor_id', '')::uuid,
      nullif(p_venda->>'vendedor_nome', ''),
      (p_venda->>'data_venda')::date,
      nullif(p_venda->>'forma_pagamento', ''),
      coalesce(nullif(p_venda->>'situacao_pagamento', ''), 'pago'),
      nullif(p_venda->>'data_pagamento', '')::date,
      nullif(p_venda->>'parcelamento', ''),
      coalesce(p_venda->'parcelas_json', '[]'::jsonb),
      nullif(p_venda->>'data_retorno_condicional', '')::date,
      coalesce((p_venda->>'desconto_venda')::numeric, 0),
      coalesce((p_venda->>'nf_transmitida')::boolean, false),
      coalesce((p_venda->>'nf_cancelada')::boolean, false),
      nullif(p_venda->>'observacoes', '')
    ) returning id into v_id;
  end if;

  insert into itens_venda (
    venda_id, produto_id, produto_nome, quantidade, valor_unitario,
    preco_base, desconto_percentual, tipo_cliente, quantidade_vendida, quantidade_devolvida
  )
  select
    v_id,
    nullif(item->>'produto_id', '')::uuid,
    item->>'produto_nome',
    coalesce((item->>'quantidade')::integer, 1),
    coalesce((item->>'valor_unitario')::numeric, 0),
    coalesce((item->>'preco_base')::numeric, (item->>'valor_unitario')::numeric, 0),
    coalesce((item->>'desconto_percentual')::numeric, 0),
    coalesce(nullif(item->>'tipo_cliente', ''), 'cliente_final'),
    coalesce((item->>'quantidade_vendida')::integer, (item->>'quantidade')::integer, 0),
    coalesce((item->>'quantidade_devolvida')::integer, 0)
  from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) item;

  return v_id;
end;
$$;

grant execute on function salvar_venda(jsonb, jsonb) to authenticated;

-- ------------------------------------------------------------
-- DADOS INICIAIS DE PRODUTOS
-- Execute este bloco logado no aplicativo se os produtos ainda
-- não existirem. No SQL Editor, auth.uid() normalmente é NULL.
-- ------------------------------------------------------------
-- insert into produtos (owner_id, nome, categoria, preco, preco_consumidor, preco_profissional) values
-- (auth.uid(), 'Sérum Facial / Gel Mulateiro', 'Estética', 0, 0, 0),
-- (auth.uid(), 'Demaquilante de Limpeza Facial', 'Estética', 0, 0, 0),
-- (auth.uid(), 'Creme Hidratante Corporal Mulateiro', 'Estética', 0, 0, 0),
-- (auth.uid(), 'Óleo Clareador Corporal', 'Estética', 0, 0, 0),
-- (auth.uid(), 'Desodorante Natural RollOn', 'Estética', 0, 0, 0),
-- (auth.uid(), 'Protetor Solar 50 FPS', 'Estética', 0, 0, 0),
-- (auth.uid(), 'Protetor Solar 80 FPS Stick', 'Estética', 0, 0, 0),
-- (auth.uid(), 'Fitoterápico Apuí', 'Fitoterápico', 0, 0, 0),
-- (auth.uid(), 'Fitoterápico Samaúma', 'Fitoterápico', 0, 0, 0),
-- (auth.uid(), 'Fitoterápico Mulateiro', 'Fitoterápico', 0, 0, 0),
-- (auth.uid(), 'Fitoterápico Imburana de Cheiro', 'Fitoterápico', 0, 0, 0),
-- (auth.uid(), 'Fitoterápico João Brandinho', 'Fitoterápico', 0, 0, 0),
-- (auth.uid(), 'Fitoterápico Pau d''Arco', 'Fitoterápico', 0, 0, 0),
-- (auth.uid(), 'As 9 Plantas', 'Fitoterápico', 0, 0, 0);
