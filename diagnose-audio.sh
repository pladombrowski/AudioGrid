#!/usr/bin/env bash
# Script de diagnóstico de áudio para Linux

echo "=== DIAGNÓSTICO DE ÁUDIO AUDIOGRID ==="
echo "Data/Hora: $(date)"
echo "Sistema: $(uname -a)"
echo "Usuário: $USER"
echo ""

echo "--- Verificando Servidor de Áudio ---"
if pgrep -x "pipewire" > /dev/null; then
    echo "[OK] Pipewire está rodando."
    if pgrep -x "pipewire-pulse" > /dev/null; then
        echo "[OK] pipewire-pulse (emulação PulseAudio) está rodando."
    else
        echo "[AVISO] Pipewire está ativo, mas pipewire-pulse não foi detectado."
    fi
elif pgrep -x "pulseaudio" > /dev/null; then
    echo "[OK] PulseAudio nativo está rodando."
else
    echo "[ERRO] Nenhum servidor de áudio (PulseAudio ou Pipewire) parece estar rodando."
fi

echo ""
echo "--- Verificando Ferramentas ---"
if command -v pactl > /dev/null; then
    echo "[OK] 'pactl' está instalado."
    echo "Versão do pactl: $(pactl --version | head -n 1)"
else
    echo "[ERRO] 'pactl' NÃO está instalado. Instale o pacote pulseaudio-utils."
fi

if command -v vlc > /dev/null; then
    echo "[OK] 'vlc' está instalado."
    echo "Versão do VLC: $(vlc --version | head -n 1)"
else
    echo "[ERRO] 'vlc' NÃO está instalado. Instale o VLC Media Player."
fi

echo ""
echo "--- Verificando Grupos de Usuário ---"
if groups "$USER" | grep -q "\baudio\b"; then
    echo "[OK] Usuário '$USER' está no grupo 'audio'."
else
    echo "[AVISO] Usuário '$USER' NÃO está no grupo 'audio'. Isso pode limitar o acesso aos dispositivos de hardware."
fi

echo ""
echo "--- Dispositivos Virtuais AudioGrid ---"
if command -v pactl > /dev/null; then
    echo "Sinks virtuais AudioGrid encontrados:"
    pactl list short sinks | grep -E "audiogrid" || echo "Nenhum sink virtual AudioGrid encontrado."
    
    echo "Sources virtuais AudioGrid encontradas:"
    pactl list short sources | grep -E "audiogrid" || echo "Nenhuma source virtual AudioGrid encontrada."
else
    echo "Não foi possível verificar dispositivos virtuais (pactl ausente)."
fi

echo ""
echo "--- Todos os Dispositivos de Áudio (pactl) ---"
if command -v pactl > /dev/null && pactl info > /dev/null 2>&1; then
    echo "Saídas (Sinks) disponíveis:"
    pactl list short sinks
    echo ""
    echo "Entradas (Sources) disponíveis:"
    pactl list short sources
else
    echo "Não foi possível conectar ao servidor de áudio ou pactl ausente."
fi

echo ""
echo "=== FIM DO DIAGNÓSTICO ==="
