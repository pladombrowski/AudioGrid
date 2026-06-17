#!/usr/bin/env bash
# Script de correção e configuração de áudio virtual no Linux

set -euo pipefail

echo "=== CORREÇÃO E CONFIGURAÇÃO DE ÁUDIO AUDIOGRID (LINUX) ==="

# 1. Verificar se pactl existe
if ! command -v pactl > /dev/null; then
    echo "Erro: 'pactl' não encontrado. Por favor, instale o pacote 'pulseaudio-utils'."
    echo "No Ubuntu/Debian: sudo apt install pulseaudio-utils"
    exit 1
fi

# 2. Adicionar o usuário ao grupo 'audio' se necessário
if ! groups "$USER" | grep -q "\baudio\b"; then
    echo "Adicionando usuário '$USER' ao grupo 'audio' para acesso aos dispositivos..."
    if command -v sudo > /dev/null; then
        sudo usermod -a -G audio "$USER"
        echo "[INFO] Usuário adicionado ao grupo 'audio'. Você precisará reiniciar a sessão ou o computador para aplicar."
    else
        echo "[AVISO] Comando 'sudo' não encontrado. Por favor, execute manualmente: usermod -a -G audio $USER como root."
    fi
fi

# 3. Garantir que o servidor de áudio esteja respondendo
if ! pactl info > /dev/null 2>&1; then
    echo "Servidor de áudio não está respondendo. Tentando iniciar..."
    if pgrep -x "pipewire" > /dev/null; then
        systemctl --user restart pipewire-pulse || true
    else
        pulseaudio --start --exit-idle-time=-1 || true
    fi
    sleep 2
fi

if ! pactl info > /dev/null 2>&1; then
    echo "[ERRO] Não foi possível conectar ao servidor de áudio PulseAudio/PipeWire."
    exit 1
fi

# 4. Remover módulos antigos do AudioGrid se existirem para evitar duplicados
echo "Limpando configurações anteriores do AudioGrid..."
# Obter IDs dos módulos carregados para audiogrid (evita falha sob pipefail se o grep não encontrar correspondências)
set +e
mod_ids=$(pactl list modules 2>/dev/null | grep -B 1 -E "sink_name=audiogrid_mix|audiogrid" | grep "Argumento" -B 1 | grep "Módulo #" | awk '{print $2}')
set -e
if [ -n "$mod_ids" ]; then
    echo "$mod_ids" | while read -r mod_id; do
        if [ -n "$mod_id" ]; then
            echo "Descarregando módulo anterior ID: $mod_id"
            pactl unload-module "$mod_id" || true
        fi
    done
fi

# 5. Criar Sink Virtual
echo "Criando sink virtual 'AudioGrid Mix'..."
SINK_ID=$(pactl load-module module-null-sink sink_name=audiogrid_mix sink_properties=device.description="AudioGrid Mix")
echo "Sink virtual criado com ID: $SINK_ID"

# 6. Criar Loopback (redirecionar microfone padrão para o sink virtual)
echo "Configurando loopback (redirecionando microfone padrão para o AudioGrid Mix)..."
# Tenta obter a entrada padrão do usuário
DEFAULT_SOURCE=$(pactl info | grep "Fonte padrão" | cut -d' ' -f3- || echo "@DEFAULT_SOURCE@")
if [ -z "$DEFAULT_SOURCE" ]; then
    DEFAULT_SOURCE="@DEFAULT_SOURCE@"
fi
echo "Usando dispositivo de entrada: $DEFAULT_SOURCE"

LOOP_ID=$(pactl load-module module-loopback source="$DEFAULT_SOURCE" sink=audiogrid_mix)
echo "Loopback configurado com ID: $LOOP_ID"

# 7. Desativar suspensão de dispositivos de áudio por ociosidade no PipeWire/WirePlumber
if systemctl --user is-active --quiet wireplumber; then
    echo "Desativando suspensão de áudio por ociosidade no WirePlumber (evita corte de milissegundos no início de sons)..."
    WP_CONF_DIR="$HOME/.config/wireplumber/wireplumber.conf.d"
    mkdir -p "$WP_CONF_DIR"
    
    # Criar arquivo de configuração SPA-JSON para WirePlumber 0.5+
    cat << 'EOF' > "$WP_CONF_DIR/51-disable-suspension.conf"
monitor.alsa.rules = [
  {
    matches = [
      {
        node.name = "~alsa_output.*"
      },
      {
        node.name = "~alsa_input.*"
      }
    ]
    actions = {
      update-props = {
        session.suspend-timeout-seconds = 0
      }
    }
  }
]
EOF
    echo "Reiniciando WirePlumber para aplicar configurações..."
    systemctl --user restart wireplumber || true
    echo "[INFO] Suspensão desativada no WirePlumber."
fi

echo ""
echo "=== CONFIGURAÇÃO CONCLUÍDA COM SUCESSO ==="
echo "Os dispositivos virtuais foram criados e estão prontos!"
echo "Para usá-los:"
echo "1. Abra o AudioGrid: npm start"
echo "2. No Discord, Google Meet, Zoom, etc., vá em Configurações de Áudio."
echo "3. Defina o 'Dispositivo de Entrada' (Microfone) para: 'AudioGrid Mix.monitor' ou 'Monitor of AudioGrid Mix'"
echo ""
echo "Nota: Dispositivos criados via pactl são temporários e serão removidos ao reiniciar."
echo "Para torná-los permanentes ou carregá-los no boot, você pode adicionar este script à inicialização do sistema."
