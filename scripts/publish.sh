#!/usr/bin/env bash
# Kopiert Wall-E ohne private Dateien in ein eigenes Git-Repo (z. B. für GitHub) und committet dort.
# Das private Repo bleibt unverändert. Das öffentliche Repo hat eine eigene Historie (keine alten Commits).
#
#   scripts/publish.sh "Nachricht"      Ziel: $WALL_E_PUBLIC_DIR oder ~/wall-e-public
#   Autor der Commits: WALL_E_PUBLIC_NAME / WALL_E_PUBLIC_EMAIL (einmal setzen, siehe unten)
#
# Ablauf: Dateien kopieren (ohne .publishignore) → nach privaten Daten suchen (.publish-denylist und
# typische Schlüssel/Tokens) → Tests und Build im Ziel → Commit. Bei einem Fund wird abgebrochen.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${WALL_E_PUBLIC_DIR:-$HOME/wall-e-public}"
MESSAGE="${1:-Stand aus dem privaten Repo}"

mkdir -p "$DEST"

# 1. Nur Dateien, die Git kennt (versioniert oder neu, ohne .gitignore), minus .publishignore
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT
{ (cd "$SRC" && git ls-files --cached --others --exclude-standard) | grep -vxF -f <(grep -v '^#' "$SRC/.publishignore" | sed '/^$/d') || true; } | while IFS= read -r f; do
  [[ -e "$SRC/$f" ]] && echo "$f"
done > "$LIST"
rsync -a --files-from="$LIST" "$SRC/" "$DEST/"
# rsync --files-from löscht nichts außerhalb der Liste – übrige alte Dateien entfernen
(cd "$DEST" && { find . -type f -not -path './.git/*' -not -path './node_modules/*' -not -path './dist/*' | sed 's#^\./##' | grep -vxF -f "$LIST" || true; } | while IFS= read -r old; do rm -f "$old"; done)
find "$DEST" -type d -empty -not -path '*/.git*' -delete 2>/dev/null || true

# Für Agents im öffentlichen Repo nur die allgemeine Anleitung
printf '@AGENT.md\n' > "$DEST/CLAUDE.md"

# 2. Nach privaten Daten suchen
FOUND=0
if [[ -f "$SRC/.publish-denylist" ]]; then
  while IFS= read -r term; do
    [[ -z "$term" || "$term" == \#* ]] && continue
    if grep -rIil --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist -- "$term" "$DEST" >/dev/null; then
      echo "Privater Begriff gefunden: '$term' in:"
      grep -rIil --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist -- "$term" "$DEST" | sed "s#^$DEST/#  #"
      FOUND=1
    fi
  done < "$SRC/.publish-denylist"
fi
# Typische Geheimnisse: lange Export-Schlüssel, API-Token-Zuweisungen, private Schlüssel
if grep -rInE --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist --exclude='package-lock.json' \
  -e 'export\?e=[A-Za-z0-9_-]{30,}' -e '(api[_-]?key|token|secret|password)["'"'"' ]*[:=] *["'"'"'][A-Za-z0-9_-]{16,}' -e 'BEGIN [A-Z ]*PRIVATE KEY' "$DEST"; then
  echo "Mögliche Zugangsdaten gefunden (siehe oben)."
  FOUND=1
fi
if [[ "$FOUND" -ne 0 ]]; then
  echo "Abbruch: nichts committet. Bitte die Stellen im privaten Repo bereinigen."
  exit 1
fi

# 3. Funktioniert die öffentliche Fassung ohne site.config.js?
(cd "$DEST" && npm ci --no-audit --no-fund >/dev/null && npm test >/dev/null && npm run build >/dev/null)
rm -rf "$DEST/dist"

# 4. Commit im öffentlichen Repo
cd "$DEST"
[[ -d .git ]] || git init -q -b main
# Autor nur für dieses Repo: GitHub-Konto mit der noreply-Adresse (die private Mail aus der globalen
# Git-Konfiguration bleibt so verborgen). Einmal setzen, z. B.:
#   WALL_E_PUBLIC_NAME="flexi03" WALL_E_PUBLIC_EMAIL="<id>+flexi03@users.noreply.github.com" scripts/publish.sh "…"
# (die ID liefert: gh api user --jq .id). Danach bleibt der Wert in .git/config des öffentlichen Repos.
[[ -n "${WALL_E_PUBLIC_NAME:-}" ]] && git config user.name "$WALL_E_PUBLIC_NAME"
[[ -n "${WALL_E_PUBLIC_EMAIL:-}" ]] && git config user.email "$WALL_E_PUBLIC_EMAIL"
if ! git config --local user.email >/dev/null; then
  echo "Bitte Autor setzen: WALL_E_PUBLIC_NAME und WALL_E_PUBLIC_EMAIL (GitHub-noreply-Adresse)."
  exit 1
fi
git add -A
if git diff --cached --quiet; then
  echo "Keine Änderungen – nichts zu committen."
else
  git commit -q -m "$MESSAGE"
  echo "Committet in $DEST: $(git log --oneline -1)"
fi
git remote get-url origin >/dev/null 2>&1 || echo "Noch kein Remote. Z. B.: git -C \"$DEST\" remote add origin git@github.com:<name>/wall-e.git && git -C \"$DEST\" push -u origin main"
