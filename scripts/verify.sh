#!/usr/bin/env bash
#
# Full verification for the Rosillo AI Platform.
#
# Runs everything that gates a change, in increasing order of cost, so the cheapest
# failure is the one you see first. Any step failing fails the script.
#
# The end-to-end suite is deliberately not here: it starts two servers and needs a
# production build, so it is a separate `npm run build && npm run test:e2e`.
#
# SYNTHETIC DATA ONLY.

set -euo pipefail

cd "$(dirname "$0")/.."

step() {
  printf '\n\033[1m── %s ─────────────────────────────────────────\033[0m\n' "$1"
}

step "Type checking every package and both applications"
npm run typecheck

step "Unit, integration and security tests"
npm test

step "Labelled Concierge evaluation (acceptance gates)"
npm run evaluate

step "Production build"
npm run build

printf '\n\033[32mAll verification steps passed.\033[0m\n'
printf 'End-to-end tests are separate: npm run test:e2e\n\n'
