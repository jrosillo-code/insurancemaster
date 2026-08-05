#!/usr/bin/env bash
#
# One-command database setup for a hosted deployment.
#
#   ./scripts/setup-database.sh 'postgresql://postgres.<ref>:<pw>@...supabase.com:5432/postgres'
#
# Creates the application's own least-privilege role, applies both migrations in the
# right order, verifies that the role genuinely cannot rewrite history, and prints the
# connection string to put in Vercel.
#
# Run it against the **direct** connection (port 5432), not the pooler: it issues DDL.
#
# Safe to re-run. The migrations are idempotent and an existing role keeps its
# password unless you pass a new one.
#
# SYNTHETIC DATA ONLY. Never point this at a database holding real client data.

set -euo pipefail

cd "$(dirname "$0")/.."

DATABASE_URL="${1:-${DATABASE_URL:-}}"
APP_PASSWORD="${2:-${ROSILLO_APP_PASSWORD:-}}"

if [[ -z "$DATABASE_URL" ]]; then
  cat >&2 <<'USAGE'
Usage: ./scripts/setup-database.sh <admin-connection-string> [app-password]

  <admin-connection-string>  Supabase → Project Settings → Database → URI.
                             Use the DIRECT connection (port 5432): this issues DDL.
  [app-password]             Password for the rosillo_app role.
                             Generated for you if omitted.
USAGE
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is not installed. Install the PostgreSQL client, or paste the files in" >&2
  echo "supabase/migrations/ into the Supabase SQL editor in numeric order." >&2
  exit 2
fi

step() { printf '\n\033[1m── %s ─────────────────────────────────────────\033[0m\n' "$1"; }
run()  { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }

if [[ -z "$APP_PASSWORD" ]]; then
  # openssl is present wherever psql is, in practice; fall back to the kernel if not.
  APP_PASSWORD="$(openssl rand -hex 24 2>/dev/null || head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  GENERATED=1
fi

step "Creating the application role"
# The role is created here rather than in a migration because its password would
# otherwise have to live in a file in the repository.
run <<SQL
do \$\$
begin
  if exists (select 1 from pg_roles where rolname = 'rosillo_app') then
    alter role rosillo_app with login password '${APP_PASSWORD}';
    raise notice 'rosillo_app already existed — password updated.';
  else
    create role rosillo_app login password '${APP_PASSWORD}';
    raise notice 'rosillo_app created.';
  end if;
end;
\$\$;
SQL

step "Applying migrations"
for migration in supabase/migrations/*.sql; do
  echo "  $migration"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$migration"
done

step "Verifying the role cannot rewrite history"
# The point of the least-privilege role: it must not be able to remove the constraints
# it is bound by. If any of these succeeds, the deployment is not what it claims.
FAILURES=0
for statement in \
  'drop trigger audit_events_append_only on audit_events' \
  'alter table audit_events disable trigger all' \
  'delete from audit_events' \
  'truncate audit_events'; do
  if psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q \
      -c "set role rosillo_app" -c "$statement" >/dev/null 2>&1; then
    echo "  ✗ PERMITTED (it must not be): $statement"
    FAILURES=$((FAILURES + 1))
  else
    echo "  ✓ refused: $statement"
  fi
done

if [[ "$FAILURES" -ne 0 ]]; then
  echo >&2
  echo "$FAILURES operation(s) the application role should not have were permitted." >&2
  echo "Do not deploy against this database until that is understood." >&2
  exit 1
fi

# Rewrite the admin URI into one for the application role, so the value below can be
# pasted straight into Vercel. Host, port and database stay exactly as given.
APP_URL="$(
  ADMIN="$DATABASE_URL" PW="$APP_PASSWORD" node -e '
    const url = new URL(process.env.ADMIN);
    url.username = "rosillo_app";
    url.password = process.env.PW;
    console.log(url.toString());
  ' 2>/dev/null || echo ''
)"

step "Done"
cat <<SUMMARY

Set DATABASE_URL to this in BOTH Vercel projects — the shared database is what
makes the client-to-adviser handoff work:

  ${APP_URL:-postgresql://rosillo_app:${APP_PASSWORD}@<host>:6543/postgres}

Change the port to 6543 (the transaction pooler) for Vercel. Serverless opens far
more connections than Postgres tolerates, and the pooler is what survives it.
SUMMARY

if [[ "${GENERATED:-0}" == "1" ]]; then
  cat <<'NOTE'

The rosillo_app password was generated and is shown only here. Store it in your
password manager now — it is not written to disk and cannot be recovered.
NOTE
fi

cat <<'REMINDER'

Still to set in each Vercel project:
  AUTH_SECRET   openssl rand -hex 32   (a DIFFERENT one per project)

SYNTHETIC DATA ONLY. A deployed URL is reachable by anyone who finds it, and the
sign-in in front of it is a shared demo password.
REMINDER
