# Deploy na Vercel — Sistema de Registro de Ponto (EE Profa. Marlene Frattini)

## 1. Variáveis de ambiente obrigatórias (Project → Settings → Environment Variables)

| Variável | Valor | Produção / Preview / Development |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.PROJETO:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres` | as três |
| `SEED_DEMO` | `false` | as três |
| `DATABASE_POOL_MAX` | `1` | as três |

Opcionais:

| Variável | Para quê |
|---|---|
| `DATABASE_SSL=true` | força SSL (já é automático em hosts remotos) |
| `DATABASE_SSL_REJECT_UNAUTHORIZED=true` | valida o certificado do servidor (mais rigoroso) |
| `GESTOR_EMAIL` / `GESTOR_SENHA` / `GESTOR_NOME` | usuário de gestão criado quando o banco está vazio |
| `SEED_DEMO=true` | apenas em ambiente de testes: cria dados fictícios |

> **Importante:** use sempre a connection string do **Connection Pooler (Session pooler, porta 5432)**.
> O host de conexão direta do Supabase (`db.PROJETO.supabase.co`) é **IPv6-only** e falha em ambientes
> serverless que não têm IPv6.

## 2. Por que `DATABASE_POOL_MAX=1`

Cada instância serverless da Vercel abre o seu próprio pool. Com `max=5`, 5 instâncias simultâneas
consomem 25 conexões e esgotam o pooler do Supabase (limite do plano) — o sintoma típico são erros
500 intermitentes nas telas mais pesadas, como o Livro Ponto.

O sistema já detecta o ambiente Vercel/Lambda e adota automaticamente `max=1` e
`allowExitOnIdle`, mas definir a variável explicitamente evita surpresas.

## 3. Checklist de validação após o deploy

1. `https://SEU-APP.vercel.app/api/health` → deve responder
   `{"ok":true,"banco":{"conectado":true,"pooler":true,"ssl":true,"serverless":true,"poolMax":1}}`.
2. Login de gestor → **Configuração → Banco de dados**: confirme host, SSL, 12/12 tabelas e a
   contagem de registros.
3. Abra **Livro ponto** e **Meu Livro Ponto** — são as telas que mais consultam o banco.
4. Se aparecer a tela “Não foi possível carregar esta tela”, anote o **código do erro (digest)** e
   verifique os **Logs** da Vercel (Functions) — a causa aparece registrada com o prefixo `[api]`,
   `[health]` ou `[livro-ponto]`.

## 4. Como o sistema se comporta em produção

- `SEED_DEMO=false`: nenhum servidor/marcação de demonstração é criado; apenas o usuário de gestão
  (quando o banco está vazio).
- SSL obrigatório, pool reduzido, `allowExitOnIdle` ativo e pool reaproveitado entre invocações.
- `pg` marcado como `serverExternalPackages` (evita erro de bundling do driver em serverless).
- Rotas pesadas com `maxDuration` (30 s; backup 60 s).
- Telas de erro amigáveis (app, gestor, painel, livro ponto) com código de erro e botão de tentar
  novamente — em vez do erro críptico de Server Components.
- `/api/health` informa o estado real da conexão com o banco.

## 5. Migração de dados (se necessário)

1. No ambiente com dados: **Configuração → Backup e restauração → Baixar backup agora**.
2. No ambiente novo: **Restaurar sistema** (digite `RESTAURAR`).
   A restauração é transacional e preserva IDs, brasão, horários, feriados, ausências e auditoria.

## 6. Segurança

- Troque a senha do banco no Supabase (Settings → Database → Reset password) caso ela tenha sido
  compartilhada por chat/e-mail, e atualize `DATABASE_URL` na Vercel.
- Nunca comite o `.env` com a senha real (use as Environment Variables da Vercel).
- Ative os backups automáticos do Supabase (Settings → Database → Backups).
