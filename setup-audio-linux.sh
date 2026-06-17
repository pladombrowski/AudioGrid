#!/usr/bin/env bash
# Script de configuração inicial para Linux (Ubuntu/Debian/Arch/Fedora)

set -euo pipefail

echo "=== INSTALAÇÃO DE DEPENDÊNCIAS DE ÁUDIO NO LINUX ==="

# Detectar distribuição Linux
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
else
    DISTRO="unknown"
fi

echo "Distribuição detectada: $DISTRO"

install_debian_ubuntu() {
    echo "Instalando dependências via APT..."
    sudo apt update
    sudo apt install -y pulseaudio-utils pavucontrol vlc nodejs npm
}

install_arch() {
    echo "Instalando dependências via Pacman..."
    sudo pacman -Sy --needed pulseaudio-utils pavucontrol vlc nodejs npm
}

install_fedora() {
    echo "Instalando dependências via DNF..."
    sudo dnf install -y pulseaudio-utils pavucontrol vlc nodejs npm
}

case "$DISTRO" in
    ubuntu|debian|mint|pop)
        install_debian_ubuntu
        ;;
    arch|manjaro)
        install_arch
        ;;
    fedora)
        install_fedora
        ;;
    *)
        echo "[AVISO] Distribuição não suportada automaticamente para instalação de pacotes."
        echo "Por favor, garanta que os seguintes pacotes estejam instalados:"
        echo "- pulseaudio-utils (pactl)"
        echo "- pavucontrol"
        echo "- vlc"
        echo "- nodejs (v18+ recomendado)"
        echo "- npm"
        ;;
esac

echo "Dependências verificadas. Executando correção e configuração dos dispositivos virtuais..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
chmod +x "${SCRIPT_DIR}/fix-audio-linux.sh"
"${SCRIPT_DIR}/fix-audio-linux.sh"
