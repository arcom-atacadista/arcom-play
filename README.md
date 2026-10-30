# Arcom Play

Plataforma interna do Arcom para treinar e engajar o time:

- **Power Quiz:** quiz ao vivo, com telão, ranking, pódio e participação pelo celular (QR code ou PIN).
- **Desafio Pro:** teste do conhecimento por link, com nota e gabarito.
- **Responde +:** coleta de opinião por link, sem nota.
- **Arena Vendas:** treino de atendimento no balcão e por ligação, com 9 clientes simulados e vozes gravadas.

## Como colocar no ar

Tudo o que a TI precisa está em **[docs/INSTALACAO-TI.md](docs/INSTALACAO-TI.md)**. Resumo:

```bash
cp .env.example .env      # definir senhas e o login do marketing
docker compose up -d --build
```

O site fica na porta 8080 e deve ser publicado com HTTPS (proxy reverso da empresa).

## Estrutura

```
public/index.html      o app (site)
server/server.js       servidor: site, API e ponte do ao vivo
db/schema.sql          banco PostgreSQL (tabelas e funções)
docker-compose.yml     instalação completa (servidor + banco)
Dockerfile             imagem do servidor
scripts/backup.sh      cópia de segurança do banco
docs/INSTALACAO-TI.md  manual da TI
```

## Dados

- As respostas, os testes publicados e a cópia do que o marketing cria ficam no PostgreSQL **sem prazo para apagar**.
- O app também gera uma **cópia de segurança completa** (tela Usuários). Guarde ao menos uma por ano.

## Testado

Antes de subir para este repositório, a versão foi testada com o servidor e o PostgreSQL de verdade: login definido pela TI, publicação, respostas vindas de outros aparelhos, resultados, cópia automática, Power Quiz ao vivo com celulares, exportação em CSV, e reinício do servidor sem perda de dados.

## Identidade visual

Segue o Arcom Design System: verde-escuro `#1F4033`, verde-arcom `#007840`, verde-lima `#BAE64F`, fonte Red Hat Display. A empresa é sempre "o Arcom".
