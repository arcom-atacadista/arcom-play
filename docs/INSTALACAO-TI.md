# Arcom Play · Manual de instalação (TI)

Este repositório tem **tudo** para colocar o Arcom Play no ar na infraestrutura do Arcom: o site, um servidor pequeno em Node.js e a estrutura do banco PostgreSQL. Não depende de nenhum serviço externo pago.

## 1. O que é

| Parte | O que faz |
| --- | --- |
| `public/index.html` | O app (site estático, um arquivo só, com imagens e vozes embutidas). |
| `server/server.js` | Servidor Node.js: entrega o site, expõe a API e faz a ponte em tempo real do Power Quiz ao vivo (WebSocket). |
| `db/schema.sql` | Tabelas e funções do PostgreSQL. O servidor aplica sozinho ao iniciar. |
| `docker-compose.yml` + `Dockerfile` | Instalação completa com um comando (servidor + PostgreSQL). |
| `scripts/backup.sh` | Cópia de segurança do banco. |

## 2. Requisitos

- **Opção A (recomendada):** um servidor Linux com **Docker** e **Docker Compose**.
- **Opção B:** **Node.js 18+** e **PostgreSQL 13+** já existentes.
- **HTTPS obrigatório** no endereço público: os navegadores só liberam microfone (Arena Vendas) e conexões seguras do ao vivo em https.
- Recursos: 1 vCPU e 1 GB de RAM são suficientes para o uso previsto.

## 3. Instalação com Docker (opção A)

```bash
git clone <este repositório> arcom-play
cd arcom-play
cp .env.example .env        # edite e troque as senhas
docker compose up -d --build
curl http://localhost:8080/healthz   # deve responder {"ok":true}
```

No `.env`:

| Variável | O que é |
| --- | --- |
| `DB_PASSWORD` | Senha interna do PostgreSQL (longa, ninguém digita). |
| `ADMIN_USER` | Usuário do marketing para entrar no app (minúsculas). |
| `ADMIN_PASSWORD` | Senha do marketing (8+ caracteres, forte). O banco guarda só um hash. |
| `APP_PORT` | Porta local do site (padrão 8080). |

Os dados ficam no volume Docker `dados-arcomplay`.

## 4. Instalação sem Docker (opção B)

```bash
cd server && npm ci --omit=dev
DATABASE_URL=postgres://usuario:senha@host:5432/arcomplay \
ADMIN_USER=marketing ADMIN_PASSWORD='senha-forte' PORT=8080 \
node server.js
```

O usuário do banco precisa poder criar tabelas, funções e a extensão `pgcrypto` na primeira execução. Para Postgres gerenciado com SSL, defina também `PGSSL=true`. Recomenda-se rodar como serviço (systemd, PM2 ou similar).

## 5. Publicar com HTTPS (proxy reverso)

Coloque o servidor atrás do proxy da empresa (Nginx, IIS, Traefik, balanceador). É necessário repassar **WebSocket** em `/api/live`. Exemplo Nginx:

```nginx
server {
  server_name play.arcom.com.br;          # exemplo de endereço
  listen 443 ssl;                          # com o certificado da empresa
  client_max_body_size 25m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location /api/live {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
  }
}
```

O endereço precisa ser **público na internet** (os participantes abrem pelo celular, no 4G).

## 6. Teste rápido depois de instalar

1. Abra `https://<endereço>/` e entre com `ADMIN_USER` / `ADMIN_PASSWORD`.
2. Em **Meus quizzes**, clique em **Compartilhar** no "Conheça o seu cliente": deve aparecer **"Publicado no servidor"**.
3. Abra o QR no celular, responda, e veja a resposta chegar em **Resultados**.
4. Em **Meus quizzes**, clique em **Iniciar** no Power Quiz e entre pelo celular com o QR.

## 7. Dados, guarda e cópias

- **Prazo de guarda:** o sistema **não tem função para apagar** dados. Testes publicados, respostas e a cópia do que o marketing cria ficam no PostgreSQL sem prazo.
- **Cópia do banco:** `scripts/backup.sh` gera um `.sql.gz` com `pg_dump`. Sugestão: agendar diariamente e manter ao menos **uma cópia por ano por 10 anos** fora do servidor.
- **Cópia pelo app:** na tela **Usuários**, o marketing pode baixar uma cópia completa em JSON.
- **LGPD:** o app guarda nome, sobrenome e respostas dos colaboradores. Recomenda-se registrar a finalidade (treinamento interno) e informar os participantes.

## 8. Segurança

- Publicar e ler resultados exige a chave derivada da senha do marketing. Quem responde só consegue abrir um teste pelo código e enviar a própria resposta.
- Limites por IP: 20 tentativas de login e 300 chamadas por minuto.
- A senha do marketing não fica no código nem no banco (só um hash duplo SHA-256).
- Não há dados de terceiros nem chamadas a serviços pagos. O app carrega a fonte do Google Fonts e a biblioteca de QR code de um CDN público (jsDelivr/cdnjs); se a rede bloquear, o app funciona, só sem a fonte e sem o desenho do QR.

## 9. Atualizar

```bash
git pull
docker compose up -d --build
```

Os dados não são afetados (ficam no volume do banco).

## 10. Monitoramento

- `GET /healthz` → `{"ok":true}` quando o servidor e o banco estão bem.
- Logs: `docker compose logs -f app`.

## 11. API (para conferência)

Todas as chamadas são `POST /api/rpc/<função>` com JSON. Funções: `ap_check`, `ap_publish`, `ap_get`, `ap_submit`, `ap_pull`, `ap_backup_put`, `ap_backup_get` (definidas em `db/schema.sql`). Ao vivo: WebSocket em `/api/live?ch=arcomplay-live-<PIN>`, que repassa mensagens entre o telão e os celulares da mesma sala.

## 12. O que não está incluído

- **IA real dos clientes da Arena Vendas:** nesta versão, a Arena usa o cliente de demonstração (sem custo). Ligar uma IA exige contratar uma API e é um projeto à parte.
