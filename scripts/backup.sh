#!/bin/sh
# Cópia de segurança do banco do Arcom Play (rode no servidor, na pasta do projeto).
# Sugestão: agendar todo dia (cron) e guardar ao menos uma cópia por ano por 10 anos.
set -e
mkdir -p backups
ARQ="backups/arcomplay-$(date +%F).sql.gz"
docker compose exec -T db pg_dump -U arcom arcomplay | gzip > "$ARQ"
echo "Cópia salva em $ARQ"
