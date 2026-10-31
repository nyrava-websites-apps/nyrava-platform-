#!/usr/bin/env bash
set -Eeuo pipefail
cd /opt/nyrava-platform
stamp="$(date -u +%Y%m%d-%H%M%S)"
backup="/root/nyrava-backups/bank-delivery-$stamp"
mkdir -p "$backup/sources"
base="services/crm-lead-engine/crm-app"
git fetch origin feature/automatic-bank-delivery-20261031
for file in CrmDb.cs Program.cs ProspectEndpoints.cs BankDispatchService.cs BankDeliveryReconciler.cs BillingSyncEndpoints.cs; do
  if [[ -f "$base/$file" ]]; then cp -a "$base/$file" "$backup/sources/$file"; fi
  git show "FETCH_HEAD:$base/$file" > "$base/$file"
done
mkdir -p "$base/tests/NyravaCRM.Tests"
git show "FETCH_HEAD:$base/tests/NyravaCRM.Tests/BankBonusTests.cs" > "$base/tests/NyravaCRM.Tests/BankBonusTests.cs"
echo "=== Building CRM image (live service unaffected) ==="
old_image="$(docker inspect nyrava-platform-crm-lead-engine-1 --format '{{.Image}}')"
docker tag "$old_image" "nyrava-platform-crm-lead-engine:before-bank-delivery-$stamp"
docker compose build crm-lead-engine
echo "=== Running isolated bank-bonus tests ==="
docker run --rm -v "$PWD/$base:/src" -w /src/tests/NyravaCRM.Tests mcr.microsoft.com/dotnet/sdk:8.0 dotnet test -c Release --filter FullyQualifiedName~BankBonusTests --verbosity minimal
echo "=== Backing up active SQLite ==="
BACKUP_DIR="$backup" python3 - <<'PY'
import os,sqlite3
source='/var/lib/docker/volumes/nyrava-platform_crm_db_data/_data/nyrava-crm.db'
dest=os.path.join(os.environ['BACKUP_DIR'],'nyrava-crm.db')
with sqlite3.connect(f'file:{source}?mode=ro',uri=True) as src:
    with sqlite3.connect(dest) as dst: src.backup(dst)
with sqlite3.connect(dest) as db: assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
print('Backup integrity OK:',dest)
PY
echo "=== Deploying tested image ==="
docker compose up -d --no-deps --no-build crm-lead-engine
healthy=0
for attempt in $(seq 1 20); do
  if [[ "$(curl --max-time 5 -sS -o /dev/null -w '%{http_code}' http://localhost:5180/metrics 2>/dev/null)" == "200" ]]; then healthy=1; break; fi
  sleep 2
done
if [[ "$healthy" != "1" ]]; then
  echo "Health failed, restoring previous running image"
  docker tag "nyrava-platform-crm-lead-engine:before-bank-delivery-$stamp" nyrava-platform-crm-lead-engine:latest
  docker compose up -d --no-deps --no-build crm-lead-engine
  exit 1
fi
python3 - <<'PY'
import sqlite3
path='/var/lib/docker/volumes/nyrava-platform_crm_db_data/_data/nyrava-crm.db'
with sqlite3.connect(f'file:{path}?mode=ro',uri=True) as db:
    cols={r[1] for r in db.execute('PRAGMA table_info(Contacts)')}
    assert 'DiscoveredAt' in cols, 'Missing original discovery date column'
    print('Discovery date migration verified')
PY
echo "CRM LIVE: HTTP 200. Backup folder: $backup"
