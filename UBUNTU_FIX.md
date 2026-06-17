# Correção para Ubuntu - Problemas de Áudio

## Problema Identificado
Baseado nos logs fornecidos, identifiquei os seguintes problemas:

1. **PulseAudio não está rodando**: `pulseaudio: command not found`
2. **Nenhum dispositivo de áudio detectado**: `[WARNING] Nenhum dispositivo: Nenhum dispositivo de áudio encontrado`
3. **Mixagem para automaticamente**: O sistema para a mixagem após alguns segundos

## Solução Passo a Passo

### 1. Execute o Diagnóstico
```bash
./diagnose-audio.sh
```

### 2. Execute a Correção Automática
```bash
./fix-audio-linux.sh
```

### 3. Se Ainda Não Funcionar, Execute Manualmente:

#### 3.1. Instalar Dependências
```bash
sudo apt update
sudo apt install -y pulseaudio pulseaudio-utils pavucontrol alsa-utils
```

#### 3.2. Adicionar Usuário ao Grupo Audio
```bash
sudo usermod -a -G audio $USER
# IMPORTANTE: Reinicie o sistema após este comando
```

#### 3.3. Configurar PulseAudio
```bash
# Parar processos conflitantes
pkill -f pulseaudio
pkill -f pipewire

# Iniciar PulseAudio
pulseaudio --start

# Verificar se está rodando
pactl info
```

#### 3.4. Criar Dispositivos Virtuais
```bash
# Criar sink virtual
pactl load-module module-null-sink sink_name=audiogrid_mix sink_properties=device.description="AudioGrid Mix"

# Criar loopback
pactl load-module module-loopback source=@DEFAULT_SOURCE@ sink=audiogrid_mix

# Verificar se foram criados
pactl list short sinks | grep audiogrid
pactl list short sources | grep audiogrid
```

### 4. Configurar AudioGrid

#### 4.1. Reiniciar o AudioGrid
```bash
# Pare o AudioGrid se estiver rodando
pkill -f AudioGrid

# Inicie novamente
./AudioGrid
```

#### 4.2. Configurar Mixagem
1. Clique com botão direito na janela do AudioGrid
2. Selecione "Mixagem de Áudio"
3. Selecione "Configurar Dispositivos"
4. Escolha seus dispositivos de microfone e saída
5. Selecione "Iniciar Mixagem"

### 5. Configurar Discord/Meet
1. No Discord: Configurações → Voz e Vídeo → Dispositivo de Entrada
2. Selecione "AudioGrid Mix" ou "AudioGrid Mix Source"
3. Teste o áudio

### 6. Configurar Atalho de Teclado Global no Wayland
No Ubuntu (ou qualquer distro com Wayland), o Electron não consegue registrar atalhos de teclado globais devido a restrições de segurança do compositor. Use o utilitário de atalhos nativo do sistema para vincular a tecla desejada à nossa API:
1. Abra as **Configurações** do Ubuntu.
2. Vá em **Teclado** → **Atalhos de Teclado** (ou **Atalhos personalizados**).
3. Clique em **Personalizar atalhos** e depois em **Adicionar atalho** (+):
   - **Nome**: `AudioGrid Toggle`
   - **Comando**: `curl http://localhost:3000/window/toggle`
   - **Atalho**: Pressione a tecla desejada (ex: `F3` ou qualquer outra de sua preferência).
4. Clique em **Adicionar**. Pressionar essa tecla agora alternará a exibição do overlay de forma 100% confiável!

## Verificação Final

Execute estes comandos para verificar se tudo está funcionando:

```bash
# Verificar PulseAudio
pactl info

# Verificar dispositivos virtuais
pactl list short sinks | grep audiogrid
pactl list short sources | grep audiogrid

# Verificar dispositivos de áudio
pactl list short sources
pactl list short sinks
```

## Se Ainda Não Funcionar

### Problema: PulseAudio não inicia
```bash
# Tentar diferentes métodos
systemctl --user start pulseaudio
# ou
pulseaudio --start --log-target=syslog
# ou
pulseaudio --kill && pulseaudio --start
```

### Problema: Sem dispositivos de áudio
```bash
# Verificar ALSA
arecord -l
aplay -l

# Reiniciar ALSA
sudo alsa force-reload
```

### Problema: Permissões negadas
```bash
# Verificar grupos
groups $USER

# Adicionar ao grupo audio (se não estiver)
sudo usermod -a -G audio $USER

# Reiniciar o sistema
sudo reboot
```

## Logs de Debug

Para obter mais informações sobre o problema:

```bash
# Executar AudioGrid com logs detalhados
PULSE_LOG=4 ./AudioGrid 2>&1 | tee audiogrid.log

# Verificar logs do PulseAudio
journalctl --user -u pulseaudio -f
```

## Contato

Se os problemas persistirem após seguir todos os passos:
1. Execute `./diagnose-audio.sh` e salve a saída
2. Execute `pactl info` e salve a saída
3. Execute `arecord -l` e `aplay -l` e salve as saídas
4. Compartilhe essas informações para análise mais detalhada

