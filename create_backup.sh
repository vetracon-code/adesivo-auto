#!/bin/bash
set -e

PROJECT_DIR="$HOME/adesivo-auto"
BACKUP_ROOT="$HOME/adesivo-auto-backups"
STAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="$BACKUP_ROOT/adesivo-auto-backup-$STAMP"

mkdir -p "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR/project-files"

echo "===> Backup progetto in corso..."

# Carica .env se presente
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  source "$PROJECT_DIR/.env"
  set +a
fi

# Copia progetto escludendo file inutili/pesanti
rsync -av \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude 'tmp' \
  --exclude '.render' \
  "$PROJECT_DIR/" "$BACKUP_DIR/project-files/"

# Dump database
if [ -n "$DATABASE_URL" ]; then
  echo "===> Eseguo dump PostgreSQL..."
  pg_dump "$DATABASE_URL" > "$BACKUP_DIR/database.sql"
else
  echo "ATTENZIONE: DATABASE_URL non trovata. Dump database saltato." > "$BACKUP_DIR/database-warning.txt"
fi

# File promemoria env
cat > "$BACKUP_DIR/env-backup.txt" <<EOT
Verificare e reinserire queste variabili nel futuro deploy:

- DATABASE_URL
- ADMIN_EMAIL
- ADMIN_PASSWORD
- VAPID_PUBLIC_KEY
- VAPID_PRIVATE_KEY
- eventuali altre chiavi future

Questo file non salva automaticamente i segreti se non già presenti nei file locali.
EOT

# Istruzioni restore
cat > "$BACKUP_DIR/RESTORE-ISTRUZIONI.txt" <<EOT
RIPRISTINO PROGETTO ADESIVO-AUTO

1. Creare un nuovo servizio web
2. Caricare il progetto contenuto in project-files/
3. Installare dipendenze con:
   npm install

4. Reinserire le variabili ambiente richieste
5. Creare un database PostgreSQL
6. Ripristinare il dump con:
   psql "NUOVA_DATABASE_URL" < database.sql

7. Avviare il servizio con:
   node server.js

8. Verificare:
   - login admin
   - owner-simple
   - owner-dashboard
   - notifiche push
   - servizi veicolo
EOT

# Crea zip finale
cd "$BACKUP_ROOT"
zip -r "adesivo-auto-backup-$STAMP.zip" "adesivo-auto-backup-$STAMP" >/dev/null

echo "===> Backup completato:"
echo "$BACKUP_ROOT/adesivo-auto-backup-$STAMP.zip"
