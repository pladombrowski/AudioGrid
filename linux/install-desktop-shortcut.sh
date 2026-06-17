#!/usr/bin/env bash
set -euo pipefail

# Diretório deste script (pasta linux/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Argumento opcional: pasta do build (contém o binário AudioGrid)
DEFAULT_BUILD_DIR="${REPO_ROOT}/release-build-ubuntu/AudioGrid-linux-x64"
BUILD_DIR="$(realpath "${1:-$DEFAULT_BUILD_DIR}")"
BINARY="${BUILD_DIR}/AudioGrid"
ICON="${REPO_ROOT}/AudioGrid.ico"
TEMPLATE="${SCRIPT_DIR}/audiogrid.desktop"
OUT_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
OUT_FILE="${OUT_DIR}/audiogrid.desktop"

if [[ ! -x "$BINARY" && ! -f "$BINARY" ]]; then
  echo "Binário não encontrado: ${BINARY}" >&2
  echo "Uso: $0 [caminho_para_AudioGrid-linux-x64]" >&2
  exit 1
fi

if [[ ! -f "$ICON" ]]; then
  echo "Ícone não encontrado: ${ICON}" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

ICON_ABS="$(realpath "$ICON")"
BUILD_ABS="$(realpath "$BUILD_DIR")"

sed -e "s|@@RELEASE_DIR@@|${BUILD_ABS}|g" -e "s|@@ICON_PATH@@|${ICON_ABS}|g" "$TEMPLATE" > "$OUT_FILE"
chmod +x "$OUT_FILE"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$OUT_DIR" 2>/dev/null || true
fi

echo "Atalho criado: ${OUT_FILE}"
echo "Exec: ${BUILD_ABS}/AudioGrid"
