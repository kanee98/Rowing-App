"""User-operated MySQL export/restore. Requires local MySQL client executables."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
from sqlalchemy.engine import make_url


def connection_options(raw_url):
    url = make_url(raw_url)
    if url.get_backend_name() != 'mysql' or not url.database or not url.username:
        raise ValueError('Provide a MySQL DATABASE_URL containing a database and user')
    args = ['--host=' + (url.host or '127.0.0.1'), '--port=' + str(url.port or 3306), '--user=' + url.username]
    if url.query:
        raise ValueError('URL query options are not supported by this helper; use your managed MySQL backup tooling for TLS/custom connection options')
    env = dict(os.environ, MYSQL_PWD=url.password or '')
    return url.database, args, env


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='action', required=True)
    backup = commands.add_parser('backup')
    backup.add_argument('--directory', type=Path, default=Path('backups'))
    restore = commands.add_parser('restore')
    restore.add_argument('--file', type=Path, required=True)
    restore.add_argument('--confirm-database', required=True, help='Exact database name; restore can overwrite its data')
    options = parser.parse_args()
    try:
        database, args, env = connection_options(os.environ.get('DATABASE_URL', ''))
    except ValueError as error:
        parser.error(str(error))
    if options.action == 'backup':
        options.directory.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        target = options.directory / ('mysql-' + stamp + '.sql')
        try:
            with target.open('xb') as output:
                subprocess.run(['mysqldump', *args, '--single-transaction', '--no-tablespaces', '--hex-blob', '--triggers', '--', database], stdout=output, env=env, check=True)
        except (OSError, subprocess.CalledProcessError):
            target.unlink(missing_ok=True)
            raise SystemExit('Backup failed; incomplete export removed. Check your MySQL client and connection.')
        print('Backup saved: ' + str(target.resolve()))
    else:
        if options.confirm_database != database:
            parser.error('Confirmation does not match the target database. Nothing was restored.')
        source = options.file.resolve(strict=True)
        if not source.is_file() or source.suffix.lower() != '.sql':
            parser.error('Choose an existing .sql backup')
        print('Restoring into ' + database + '; keep application writers stopped during this operation.')
        with source.open('rb') as input_file:
            subprocess.run(['mysql', *args, '--', database], stdin=input_file, env=env, check=True)
        print('Restore completed. Restart the backend to apply any outstanding versioned migrations.')


if __name__ == '__main__':
    main()
