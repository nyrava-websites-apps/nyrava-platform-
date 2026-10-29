#!/usr/bin/env python3
"""Activate the previously built Nyrava release. No database restore on failure."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

ROOT = Path('/opt/nyrava-platform')
RELEASE = '87ac89a83d0ea35348b95c430a5c40659a2821a7'


def run(args, capture=False):
    if capture:
        return subprocess.check_output(args, text=True, stdin=subprocess.DEVNULL).strip()
    subprocess.run(args, check=True, stdin=subprocess.DEVNULL)


def inspect(name):
    return json.loads(run(['docker', 'inspect', name], True))[0]


def environment(info):
    return dict(item.split('=', 1) for item in info['Config'].get('Env', []) if '=' in item)


def check_url(url, expected=200):
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            return response.status == expected
    except urllib.error.HTTPError as error:
        return error.code == expected
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


def wait_url(url):
    for _ in range(30):
        if check_url(url):
            return
        time.sleep(1)
    raise RuntimeError('Service did not become healthy: ' + url)


def load_dotenv(file):
    values = {}
    if file.exists():
        for line in file.read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                values[key.strip()] = value.strip().strip('\"\'')
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--activate', action='store_true')
    parser.add_argument('--test-realtor-email')
    args = parser.parse_args()
    if not args.activate:
        print('No changes made. Use --activate after the staged build succeeds.')
        return
    if not args.test_realtor_email:
        raise SystemExit('Supply the authorized existing test Realtor email with --test-realtor-email.')
    test_email = args.test_realtor_email.strip().lower()
    os.umask(0o077)
    os.chdir(ROOT)
    manifest_path = ROOT / 'backups/PENDING-LAUNCH.json'
    manifest = json.loads(manifest_path.read_text())
    if manifest.get('activated'):
        raise SystemExit('This release is already activated; do not repeat.')
    if not manifest.get('built') or manifest.get('commit') != RELEASE:
        raise SystemExit('Expected tested release has not been built.')
    backup = Path(manifest['backup']).resolve()
    stage = Path(manifest['stage']).resolve()
    if ROOT / 'backups' not in backup.parents or stage.parent != backup:
        raise SystemExit('Unexpected staging path.')
    runtime = json.loads((backup / 'runtime.json').read_text())
    override = ROOT / 'docker-compose.override.yml'
    if override.exists():
        raise SystemExit('An override already exists; preserve it and review before activation.')
    for service, previous in runtime.items():
        cid = run(['docker', 'compose', 'ps', '-q', service], True)
        current = inspect(cid)
        if current['Id'] != previous['Id'] or current['State']['Status'] != 'running':
            raise SystemExit('Live container changed since staging: ' + service)
    # Check that source files did not change during the build.
    expected = {
        'services/web-portal/server.mjs': '9e8c7e02fe62f9249596c292ea68630ff1bbb90dad2b6c8a62487423d2c3ae34',
        'services/crm-lead-engine/crm-app/Program.cs': 'c7c9b6af67b21579cbf13e8ea54050141e80ab2a19a6f6a856f3e96154cf0616',
        'services/crm-lead-engine/crm-app/CrmDb.cs': 'c877a198b9f5a14432ca84ddd0f1a9f42f2fdaf528457836ff85e2436171759d',
        'services/crm-lead-engine/run.mjs': 'a3ef8488c2298738d9f5bde0a150fb7675e342fb18f76fa901c38acd42b747a4'
    }
    for name, digest in expected.items():
        if hashlib.sha256((ROOT / name).read_bytes()).hexdigest() != digest:
            raise SystemExit('Live source changed: ' + name)
    changed = []
    for name in manifest['changed']:
        path = Path(name)
        if path.is_absolute() or '..' in path.parts or not name.startswith(('services/web-portal/', 'services/crm-lead-engine/')):
            raise SystemExit('Unsafe source path in manifest.')
        if not (stage / path).is_file():
            raise SystemExit('Staged source is missing: ' + name)
        changed.append(path)
    daemon = inspect('nyrava-lead-daemon')
    if daemon['State']['Status'] != 'running':
        raise SystemExit('Collector was not running; review before activation.')
    dotenv = ROOT / 'services/crm-lead-engine/.env'
    original_env = dotenv.read_bytes() if dotenv.exists() else None
    collector_env = environment(daemon)
    collector_settings = load_dotenv(dotenv)
    token = collector_env.get('CRM_API_KEY') or collector_settings.get('CRM_API_KEY', '')
    dbpath = Path('/var/lib/docker/volumes/nyrava-platform_crm_db_data/_data/nyrava-crm.db')
    db = sqlite3.connect(str(dbpath), timeout=10)
    try:
        target = db.execute('SELECT Id, Role, WorkspaceId FROM Users WHERE lower(trim(Email))=?', (test_email,)).fetchall()
        if target != [(4, 'Owner', 4)]:
            raise SystemExit('Test account ID/email do not match the authorized account.')
        before_count = db.execute('SELECT COUNT(*) FROM Contacts').fetchone()[0]
        with sqlite3.connect(str(backup / 'crm-immediately-before-activation.db')) as destination:
            db.backup(destination)
        token_hash = hashlib.sha256(token.encode()).hexdigest().upper()
        integration = db.execute('''SELECT u.Id FROM IntegrationKeys k JOIN Users u ON u.Id=k.OwnerUserId
            WHERE k.TokenHash=? AND k.RevokedAt IS NULL AND u.Role='Admin' AND u.WorkspaceId=u.Id
            AND EXISTS(SELECT 1 FROM Memberships m WHERE m.OwnerUserId=u.Id AND m.UserId=u.Id AND m.Active=1)''', (token_hash,)).fetchone()
        if integration is None:
            if collector_env.get('CRM_API_KEY'):
                raise SystemExit('Collector has a container-level non-admin key; review its configuration before rotating it.')
            admin = db.execute('''SELECT u.Id FROM Users u WHERE u.Role='Admin' AND u.WorkspaceId=u.Id
                AND EXISTS(SELECT 1 FROM Memberships m WHERE m.OwnerUserId=u.Id AND m.UserId=u.Id AND m.Active=1)
                ORDER BY u.Id LIMIT 1''').fetchone()
            if admin is None:
                raise SystemExit('No eligible administrator integration owner was found.')
            token = secrets.token_urlsafe(48)
            now = datetime.now(timezone.utc).isoformat()
            db.execute('''INSERT INTO IntegrationKeys
                (OwnerUserId,Name,TokenHash,TokenPrefix,CreatedAt,LastUsedAt,RevokedAt)
                VALUES(?,?,?,?,?,NULL,NULL)''', (admin[0], 'Production lead intake - launch repair', hashlib.sha256(token.encode()).hexdigest().upper(), token[:16], now))
            db.commit()
    finally:
        db.close()
    sync_secret = secrets.token_urlsafe(48)
    new_services = {}
    for service, info in runtime.items():
        env = environment(info)
        env['Crm__BillingSyncSecret'] = sync_secret
        if service == 'crm-lead-engine':
            env['Crm__TestRealtorUserId'] = '4'
            env['Crm__TestRealtorEmail'] = test_email
        else:
            env['CRM_INBOUND_TOKEN'] = token
        new_services[service] = {'environment': env}
    # Keep this secret-bearing override out of local git staging.
    exclude = Path(run(['git', 'rev-parse', '--git-path', 'info/exclude'], True))
    exclude.parent.mkdir(parents=True, exist_ok=True)
    prior_exclude = exclude.read_text() if exclude.exists() else ''
    if '/docker-compose.override.yml' not in prior_exclude.splitlines():
        exclude.write_text(prior_exclude + '\n/docker-compose.override.yml\n')
    for name in changed:
        target = ROOT / name
        if target.exists():
            saved = backup / 'before' / name
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
    if original_env is not None:
        (backup / 'collector.env').write_bytes(original_env)
    settings_file = Path('/var/lib/docker/volumes/nyrava-platform_web_profile_data/_data/stripe-settings.json')
    original_settings = settings_file.read_bytes() if settings_file.exists() else None
    if original_settings is not None:
        settings = json.loads(original_settings)
        settings['checkoutEnabled'] = False
    compose = ['docker', 'compose', '-p', 'nyrava-platform', '-f', str(ROOT / 'docker-compose.yml'), '-f', str(override)]
    collector_touched = False
    try:
        override.write_text(json.dumps({'services': new_services}, indent=2))
        if original_settings is not None:
            settings_file.write_text(json.dumps(settings, indent=2))
            settings_file.chmod(0o600)
        for name in changed:
            destination = ROOT / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(stage / name, destination)
        lines = (original_env.decode() if original_env else '').splitlines()
        lines = [line for line in lines if line.split('=', 1)[0].strip() != 'CRM_API_KEY']
        dotenv.write_text('\n'.join(lines) + '\nCRM_API_KEY=' + token + '\n')
        dotenv.chmod(0o600)
        print('Activating CRM and portal; unrelated services stay running.', flush=True)
        run(compose + ['up', '-d', '--no-deps', '--no-build', 'crm-lead-engine', 'web-portal'])
        wait_url('http://127.0.0.1:5180/healthz')
        wait_url('http://127.0.0.1:3000/api/health')
        if not check_url('http://127.0.0.1:3000/'):
            raise RuntimeError('Homepage check failed.')
        for route in ['/api/admin/operations/session', '/api/ops/operations/records']:
            if not check_url('http://127.0.0.1:3000' + route, 401):
                raise RuntimeError('Anonymous admin protection check failed.')
        with urllib.request.urlopen('http://127.0.0.1:5180/api/v1/active-territories', timeout=10) as response:
            territories = json.load(response).get('activeZips', [])
        if '75034' not in territories:
            raise RuntimeError('Test Realtor territory did not activate.')
        with sqlite3.connect(dbpath.as_uri() + '?mode=ro', uri=True, timeout=10) as db:
            after_count = db.execute('SELECT COUNT(*) FROM Contacts').fetchone()[0]
            exempt = db.execute('SELECT SubscriptionNonBillingAccessGrantedAt FROM Users WHERE Id=4').fetchone()[0]
            if after_count < before_count or not exempt:
                raise RuntimeError('Record preservation or exemption verification failed.')
        collector_touched = True
        run(['docker', 'restart', 'nyrava-lead-daemon'])
        time.sleep(3)
        if inspect('nyrava-lead-daemon')['State']['Status'] != 'running':
            raise RuntimeError('Collector failed to stay running.')
        manifest['activated'] = True
        manifest['activatedAt'] = datetime.now(timezone.utc).isoformat()
        manifest_path.write_text(json.dumps(manifest))
        print('LIVE: CRM and portal healthy; anonymous admin requests blocked.')
        print('Test Realtor exemption active; ZIP 75034 active.')
        print('Lead records preserved:', after_count)
        print('Collector running with review-bank intake. Qualified-lead arrival still needs verification.')
        print('Stripe checkout remains disabled; add your settings when ready.')
        print('Backup:', backup)
    except Exception:
        print('Activation failed. Restoring prior code/images; preserving the current database.', flush=True)
        for name in changed:
            destination = ROOT / name
            saved = backup / 'before' / name
            if saved.exists():
                shutil.copy2(saved, destination)
            elif destination.exists():
                destination.unlink()
        if original_env is not None:
            dotenv.write_bytes(original_env)
        elif dotenv.exists():
            dotenv.unlink()
        if original_settings is not None:
            settings_file.write_bytes(original_settings)
        rollback = {'services': {service: {'image': info['Image'], 'pull_policy': 'never', 'environment': environment(info)} for service, info in runtime.items()}}
        rollback_file = backup / 'rollback.json'
        rollback_file.write_text(json.dumps(rollback))
        run(['docker', 'compose', '-p', 'nyrava-platform', '-f', str(ROOT / 'docker-compose.yml'), '-f', str(rollback_file), 'up', '-d', '--no-deps', '--no-build', 'crm-lead-engine', 'web-portal'])
        for info in runtime.values():
            run(['docker', 'image', 'tag', info['Image'], info['Config']['Image']])
        override.unlink(missing_ok=True)
        if collector_touched:
            run(['docker', 'restart', 'nyrava-lead-daemon'])
        raise


if __name__ == '__main__':
    main()
