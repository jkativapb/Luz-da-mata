# CRM LuzDaMata

CRM simples para gerenciar compradoras, revendedoras, visitas/contatos e
vendas dos produtos LuzDaMata, com dashboard e exportação para Excel.

## O que já está pronto

- **Login com Google** (via Supabase Auth)
- **Cadastro** de compradoras e revendedoras (abas separadas)
- **Visitas**: agendamento presencial ou por videoconferência, com
  observações; se convertida em negócio, vira automaticamente um cadastro
  de compradora ou revendedora
- **Vendas**: registro de vendas com múltiplos produtos por venda
- **Dashboard**: renda do mês, renda acumulada, produtos mais vendidos,
  clientes que mais compram, e lista de quem está há mais de 30 dias sem
  contato
- **Exportar para Excel**: baixa um `.xlsx` com abas de Compradores,
  Revendedores, Visitas, Vendas e Itens vendidos. Toda vez que você clicar
  em "Exportar", ele gera o arquivo de novo com os dados atualizados.

## Passo a passo para colocar no ar

### 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto
   (pode ser no mesmo workspace dos seus outros projetos, IDRestaurantes e
   Caixa do Bazar — mas este deve ser um projeto **separado**, com seu
   próprio banco).
2. Vá em **SQL Editor** e cole o conteúdo do arquivo `sql/schema.sql`
   (está na pasta do projeto). Rode o script — ele cria as tabelas
   (contatos, visitas, produtos, vendas, itens_venda), a segurança por
   usuário (RLS) e já deixa os produtos do catálogo pré-cadastrados
   (você edita os preços depois, direto no app ou no Supabase).
3. Vá em **Authentication > Providers** e ative o **Google**. Você vai
   precisar criar um "OAuth Client ID" no
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   (tipo "Aplicativo Web") e colar o Client ID e o Client Secret no
   Supabase. O Supabase te mostra a "Redirect URL" exata que você precisa
   cadastrar no Google — copie e cole certinho.
4. Vá em **Project Settings > API** e copie a **Project URL** e a
   **anon public key** — vai precisar delas no próximo passo.

### 2. Configurar o projeto localmente (opcional, para testar antes)

```bash
cd crm-luzdamata
cp .env.example .env
# edite o .env e cole a URL e a anon key do Supabase
npm install
npm run dev
```

### 3. Publicar no Netlify

1. Suba esta pasta para um repositório no GitHub (ou arraste a pasta
   direto no Netlify, se preferir publicar sem Git).
2. No [Netlify](https://app.netlify.com), clique em **Add new site >
   Import an existing project** e conecte o repositório.
3. Configuração de build (o `netlify.toml` já deixa isso pronto):
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Em **Site settings > Environment variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (os mesmos valores do seu `.env`)
5. Depois do primeiro deploy, copie a URL que o Netlify gerou (ex:
   `https://crm-luzdamata.netlify.app`) e volte no Google Cloud Console
   para adicionar essa URL nas "Authorized redirect URIs" e "Authorized
   JavaScript origins" do seu OAuth Client — senão o login com Google só
   funciona no `localhost`.

## Como usar no dia a dia

- **Agendar uma visita**: vá em Visitas > Agendar visita. Se a pessoa
  ainda não é cadastrada, escolha "Novo lead" e digite o nome. Marque se
  é presencial ou videoconferência.
- **Converter uma visita em negócio**: depois da visita, clique em
  "Converter em negócio" e escolha se ela vira compradora ou revendedora.
  Isso cria o cadastro automaticamente.
- **Alerta de 30 dias**: o Dashboard mostra, na seção "Precisam de
  contato", todo mundo que está há mais de 30 dias sem uma visita ou
  venda registrada. A tela de Cadastro também destaca isso em vermelho
  ao lado de cada nome.
- **Exportar**: no Dashboard, clique em "Exportar para Excel" sempre que
  quiser um arquivo atualizado para trabalhar offline.

## Estrutura de pastas

```
crm-luzdamata/
├── sql/schema.sql       # rode isso no Supabase primeiro
├── src/
│   ├── pages/            # Dashboard, Cadastro, Visitas, Vendas, Login
│   ├── components/Layout.jsx
│   ├── lib/               # helpers de data/moeda e exportação Excel
│   ├── AuthContext.jsx
│   ├── supabaseClient.js
│   └── App.jsx
├── .env.example
└── netlify.toml
```

## Próximos passos que dá pra evoluir depois

- Editar/excluir vendas e visitas já lançadas
- Editar preço dos produtos direto numa tela de "Produtos"
- Filtro de período no dashboard (não só mês atual)
- Notificação por e-mail/WhatsApp quando alguém passar de 30 dias

## Atualização técnica 1.1.0 — CRM compartilhado

Esta versão sincroniza o código React com o banco Supabase e transforma o CRM em um ambiente compartilhado pela equipe.

### Ordem de implantação

1. **Faça um backup do banco atual.**
2. Abra o **SQL Editor** do Supabase.
3. Execute `sql/schema.sql` inteiro. O script é idempotente e adiciona os campos/tabelas que estavam ausentes sem apagar os registros existentes.
4. Confirme que os usuários da equipe conseguem acessar o sistema normalmente.
5. Publique esta versão no Netlify.
6. Mantenha no Netlify as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

### O que foi corrigido

- Schema canônico sincronizado com os campos realmente usados pelo React.
- CRM compartilhado: usuários autenticados veem e editam todo o banco.
- `vendedores` e `metas_mensais` incluídos no schema.
- Campos de clientes, agenda, produtos, vendas e itens sincronizados.
- Fotos de produtos com Storage configurado.
- Salvamento de venda com `salvar_venda()` para gravar venda + itens de forma transacional.
- Exclusão de cliente convertida em arquivamento, preservando histórico.
- Relatórios com período, vendas, recebimento, a receber, condicionais, conversão, vendedores, produtos, carteira e exportação Excel.
- Layout mobile corrigido: menu lateral vira gaveta, conteúdo passa a rolar verticalmente e cabeçalho se adapta a telas pequenas.

> **Importante:** o arquivo do projeto não consegue alterar diretamente o banco remoto do seu Supabase. A sincronização do banco é feita executando `sql/schema.sql` no SQL Editor. O código já está preparado para essa estrutura.
