-- ============================================================
-- CRM LuzDaMata — Migração: status ativo/inativo em contatos
-- Rode este script no SQL Editor do Supabase, DEPOIS do schema.sql.
-- ============================================================

-- Adiciona o campo de status. Como tem "default true", todos os
-- registros já existentes continuam aparecendo normalmente (ativos).
alter table contatos
  add column if not exists ativo boolean not null default true;

-- Guarda A PARTIR DE QUANDO o contato ficou inativo. É essa data
-- que o Dashboard usa para decidir se uma venda/visita antiga ainda
-- conta nos indicadores (renda, top produtos, top clientes) ou não.
-- Fica nula enquanto o contato está ativo.
alter table contatos
  add column if not exists data_inativacao timestamptz;

-- Índice para acelerar filtros por status (listagens e dashboard
-- sempre vão filtrar por ativo = true)
create index if not exists idx_contatos_ativo on contatos(ativo);

-- Nenhuma mudança de RLS é necessária: as policies existentes em
-- "contatos" (contatos_owner_all) continuam valendo normalmente,
-- o filtro de ativo/inativo é feito na aplicação (front-end).
