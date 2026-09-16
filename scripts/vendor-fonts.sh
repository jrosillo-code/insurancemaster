#!/usr/bin/env bash
#
# Copies the latin font subsets into each app's public/fonts directory.
#
# Three families, matching the farwater design language: Big Shoulders Display
# for the condensed display sizes, Spectral for narrative, IBM Plex Mono for
# anything read as instrument text — references, dates, amounts, state labels.
#
# Vendored rather than imported from node_modules so the served files are in the
# repository and reviewable, and so nothing reaches a font CDN at runtime. That
# is not only a privacy preference here: the Content-Security-Policy on both
# apps is `font-src 'self'`, so a Google Fonts URL would be blocked outright and
# every heading would silently fall back to a system face.
#
# Only latin and latin-ext. Spanish and English need no more, and the @font-face
# rules carry unicode-range, so a browser fetches a file only when a glyph in
# that range is actually used.
#
# All three families are SIL Open Font License 1.1; the licence travels with them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for app in client-concierge employee-copilot; do
  DEST="${ROOT}/apps/${app}/public/fonts"
  mkdir -p "${DEST}"

  copy() { cp "${ROOT}/node_modules/$1" "${DEST}/"; }

  for subset in latin latin-ext; do
    copy "@fontsource-variable/big-shoulders-display/files/big-shoulders-display-${subset}-wght-normal.woff2"
    copy "@fontsource/spectral/files/spectral-${subset}-400-normal.woff2"
    copy "@fontsource/spectral/files/spectral-${subset}-600-normal.woff2"
    copy "@fontsource/ibm-plex-mono/files/ibm-plex-mono-${subset}-400-normal.woff2"
    copy "@fontsource/ibm-plex-mono/files/ibm-plex-mono-${subset}-600-normal.woff2"
  done

  {
    echo "Big Shoulders Display, Spectral and IBM Plex Mono are licensed under the"
    echo "SIL Open Font License, Version 1.1. Full text:"
    echo
    cat "${ROOT}/node_modules/@fontsource/spectral/LICENSE"
  } > "${DEST}/OFL.txt"

  echo "Vendored $(ls -1 "${DEST}"/*.woff2 | wc -l) font files into apps/${app}/public/fonts."
done
