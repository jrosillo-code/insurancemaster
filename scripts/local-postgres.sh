#!/usr/bin/env bash
#
# A throwaway PostgreSQL for the database-backed tests.
#
# The Postgres tests are skipped unless TEST_DATABASE_URL is set, because a database
# test that mocks the database tests the mock. This starts a real one, applies every
# migration, and prints the connection string to export.
#
#   ./scripts/local-postgres.sh start   # start, migrate, print the URL
#   ./scripts/local-postgres.sh stop    # stop and delete everything
#
# The cluster lives outside the repository and holds nothing but fixtures. It is not
# a development database and nothing should be kept in it.
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/postgresql/rosillo-test}"
PGPORT="${PGPORT:-55432}"
DBNAME="rosillo_test"
URL="postgres://postgres@127.0.0.1:${PGPORT}/${DBNAME}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# initdb refuses to run as root, so the cluster is owned by the postgres user. When
# this script is not run as root, it drives the binaries directly.
run_as_postgres() {
  if [ "$(id -u)" = "0" ]; then su postgres -c "$1"; else bash -c "$1"; fi
}

case "${1:-start}" in
  start)
    if ! [ -x "${PGBIN}/initdb" ]; then
      echo "PostgreSQL server binaries not found at ${PGBIN}." >&2
      echo "Install postgresql, or set PGBIN to where initdb lives." >&2
      exit 1
    fi

    if ! [ -f "${PGDATA}/PG_VERSION" ]; then
      mkdir -p "${PGDATA}"
      [ "$(id -u)" = "0" ] && chown -R postgres:postgres "$(dirname "${PGDATA}")"
      # trust auth: this cluster listens on loopback and holds only fixtures.
      run_as_postgres "${PGBIN}/initdb -D ${PGDATA} -U postgres --auth=trust" >/dev/null
    fi

    if ! run_as_postgres "${PGBIN}/pg_ctl -D ${PGDATA} status" >/dev/null 2>&1; then
      run_as_postgres "${PGBIN}/pg_ctl -D ${PGDATA} -o '-p ${PGPORT} -k /tmp' -l ${PGDATA}/log start" >/dev/null
      sleep 2
    fi

    psql "postgres://postgres@127.0.0.1:${PGPORT}/postgres" -q \
      -c "drop database if exists ${DBNAME};" -c "create database ${DBNAME};"
    for migration in "${ROOT}"/supabase/migrations/*.sql; do
      PGOPTIONS='-c client_min_messages=warning' psql "${URL}" -q -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
    done

    echo "Ready. Export this, then run the database tests:"
    echo
    echo "  export TEST_DATABASE_URL='${URL}'"
    echo "  npm run test:db"
    ;;
  stop)
    run_as_postgres "${PGBIN}/pg_ctl -D ${PGDATA} -m immediate stop" >/dev/null 2>&1 || true
    rm -rf "${PGDATA}"
    echo "Stopped and removed ${PGDATA}."
    ;;
  *)
    echo "usage: $0 [start|stop]" >&2
    exit 1
    ;;
esac
