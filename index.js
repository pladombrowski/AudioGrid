import pkg from 'electron';
const {app, BrowserWindow, globalShortcut, Menu, shell, Notification, dialog, screen, ipcMain, Tray} = pkg;
import path from 'path'
import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import uniqueString from 'unique-string';
import os from 'node:os';
import getPort from 'get-port';
import execa from 'execa';
import got from 'got';
import {platform} from 'node:process';
import cors from 'cors';
import {getAudioDurationInSeconds} from 'get-audio-duration';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Linux: electron-packager não configura chrome-sandbox (root + setuid); sem isto o processo aborta antes do main.
if (process.platform === 'linux') {
    app.commandLine.appendSwitch('disable-setuid-sandbox');
    app.commandLine.appendSwitch('no-sandbox');
    app.disableHardwareAcceleration();
}

console.log('=== AUDIOGRID INICIANDO ===');
console.log('Diretório:', __dirname);

const i18nPath = path.join(__dirname, 'i18n.properties');
const configPath = path.join(__dirname, 'config.json');
const expressApp = express();
const preferredPort = 3000;
let serverPort = preferredPort; // Porta efetiva (pode ser dinâmica se 3000 estiver bloqueada)
const vlcPort = 3001; // Porta diferente para o VLC
let localIP = 'localhost';

/** Retorna o caminho do executável VLC (no Windows tenta caminhos padrão se não estiver no PATH). */
function getVlcExecutablePath() {
    if (platform !== 'win32') return 'vlc';
    const winPaths = [
        path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'VideoLAN', 'VLC', 'vlc.exe'),
        path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'VideoLAN', 'VLC', 'vlc.exe'),
    ];
    for (const p of winPaths) {
        if (fs.existsSync(p)) return p;
    }
    return 'vlc';
}

// Configurações padrão
const defaultConfig = {
    shortcut: 'F3',
    shortcuts: {
        showHide: 'F3'
    },
    monitor: 0, // Monitor padrão (0 = primeiro monitor)
};

// Função para carregar configurações
function loadConfig() {
    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf-8');
            return { ...defaultConfig, ...JSON.parse(configData) };
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
    }
    return defaultConfig;
}

// Função para salvar configurações
function saveConfig(config) {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        return false;
    }
}

// Função para obter lista de monitores disponíveis
function getAvailableMonitors() {
    try {
        const displays = screen.getAllDisplays();
        return displays.map((display, index) => ({
            id: index,
            label: `Monitor ${index + 1}${display.primary ? ' (Principal)' : ''}`,
            bounds: display.bounds,
            workArea: display.workArea,
            scaleFactor: display.scaleFactor
        }));
    } catch (error) {
        console.error('Erro ao obter monitores:', error);
        return [{ id: 0, label: 'Monitor 1', bounds: { x: 0, y: 0, width: 1920, height: 1080 } }];
    }
}

// Função para trocar para outro monitor
function switchToMonitor(monitorId) {
    try {
        if (!mainWindow) {
            console.error('Janela principal não existe');
            return false;
        }

        const monitors = getAvailableMonitors();
        const targetMonitor = monitors.find(m => m.id === monitorId);
        
        if (!targetMonitor) {
            console.error(`Monitor ${monitorId} não encontrado`);
            return false;
        }

        // Obter dimensões do monitor
        const { x, y, width, height } = targetMonitor.bounds;
        
        // Mover e redimensionar a janela para o monitor selecionado
        mainWindow.setBounds({
            x: x,
            y: y,
            width: width,
            height: height
        });
        
        // Maximizar no monitor selecionado
        mainWindow.maximize();
        
        // Atualizar configuração
        appConfig.monitor = monitorId;
        saveConfig(appConfig);
        
        console.log(`Janela movida para ${targetMonitor.label}`);
        return true;
    } catch (error) {
        console.error('Erro ao trocar monitor:', error);
        return false;
    }
}

// Carregar configurações
let appConfig = loadConfig();


// Função para registrar atalho
function registerShortcut(shortcut, callback) {
    try {
        // Desregistrar atalho anterior se existir
        globalShortcut.unregister(shortcut);
        
        // Registrar novo atalho
        const success = globalShortcut.register(shortcut, callback);
        if (success) {
            console.log(`Atalho ${shortcut} registrado com sucesso`);
            return true;
        } else {
            console.error(`Falha ao registrar atalho ${shortcut}`);
            
            // Se falhou no Linux e o atalho não possui modificadores (tecla simples como F3),
            // tentar registrá-lo com o modificador 'Super' (tecla Windows) automaticamente para Wayland
            if (process.platform === 'linux' && !shortcut.includes('+')) {
                const fallbackShortcut = `Super+${shortcut}`;
                console.log(`Tentando registrar atalho de fallback no Linux (Wayland): ${fallbackShortcut}`);
                globalShortcut.unregister(fallbackShortcut);
                const fallbackSuccess = globalShortcut.register(fallbackShortcut, callback);
                if (fallbackSuccess) {
                    console.log(`Atalho de fallback ${fallbackShortcut} registrado com sucesso!`);
                    
                    // Atualizar a configuração para persistir o atalho de fallback
                    appConfig.shortcut = fallbackShortcut;
                    appConfig.shortcuts.showHide = fallbackShortcut;
                    saveConfig(appConfig);
                    
                    showNotification(
                        'Atalho Atualizado',
                        `O atalho F3 foi alterado para ${fallbackShortcut} devido às restrições do Wayland.`,
                        'info'
                    );
                    return true;
                }
            }
            
            if (process.platform === 'linux') {
                showNotification(
                    'Atalho Global Desativado',
                    `Não foi possível registrar o atalho ${shortcut}. No Wayland, atalhos globais exigem teclas modificadoras (ex: Super+F3).`,
                    'warning'
                );
            }
            return false;
        }
    } catch (error) {
        console.error(`Erro ao registrar atalho ${shortcut}:`, error);
        return false;
    }
}

// Listener para salvar atalho via IPC enviado pelo frontend
ipcMain.on('save-shortcut', (event, newShortcut) => {
    // Atualizar configuração
    appConfig.shortcuts.showHide = newShortcut;
    appConfig.shortcut = newShortcut; // Manter compatibilidade
    
    // Salvar configuração
    if (saveConfig(appConfig)) {
        // Registrar novo atalho
        const success = registerShortcut(newShortcut, toggleWindow);
        
        if (success) {
            event.sender.send('shortcut-registered', 'success', newShortcut);
        } else {
            event.sender.send('shortcut-registered', 'error', `Não foi possível registrar o atalho global "${newShortcut}". Verifique se a combinação é válida ou suportada.`);
        }
    } else {
        event.sender.send('shortcut-registered', 'error', 'Falha ao salvar as configurações.');
    }
});

// Função para mostrar diálogo de seleção de monitor
function showMonitorDialog() {
    const monitors = getAvailableMonitors();
    
    if (monitors.length <= 1) {
        showNotification(
            i18nTexts.no_multiple_monitors || 'Apenas um monitor',
            i18nTexts.no_multiple_monitors_message || 'Apenas um monitor foi detectado',
            'info'
        );
        return;
    }

    const options = {
        type: 'question',
        buttons: [...monitors.map(m => m.label), 'Cancelar'],
        defaultId: appConfig.monitor || 0,
        title: 'Selecionar Monitor',
        message: 'Escolha o monitor para exibir o overlay:',
        detail: `Monitor atual: ${monitors[appConfig.monitor || 0]?.label || 'Monitor 1'}`
    };

    dialog.showMessageBox(mainWindow, options).then((result) => {
        if (result.response < monitors.length) { // Não é "Cancelar"
            const selectedMonitorId = result.response;
            
            if (switchToMonitor(selectedMonitorId)) {
                showNotification(
                    i18nTexts.monitor_changed || 'Monitor Alterado',
                    `${i18nTexts.monitor_changed_message || 'Overlay movido para'}: ${monitors[selectedMonitorId].label}`,
                    'success'
                );
            } else {
                showNotification(
                    i18nTexts.error || 'Erro',
                    i18nTexts.monitor_change_error || 'Falha ao trocar monitor',
                    'error'
                );
            }
        }
    });
}






// Função para parsear arquivo de propriedades
function parseProperties(propertiesString) {
    try {
        const properties = {};
        propertiesString.split('\n').forEach((line) => {
            const trimmedLine = line.trim();
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const equalIndex = trimmedLine.indexOf('=');
                if (equalIndex > 0) {
                    const key = trimmedLine.substring(0, equalIndex).trim();
                    const value = trimmedLine.substring(equalIndex + 1).trim();
                    if (key && value) {
                        properties[key] = value;
                    }
                }
            }
        });
        return properties;
    } catch (error) {
        console.error("parseProperties exception:", error);
        return {};
    }
}

// Carregar textos de internacionalização
const i18nTexts = fs.existsSync(i18nPath)
    ? parseProperties(fs.readFileSync(i18nPath, 'utf-8'))
    : {};

expressApp.use(bodyParser.json());
expressApp.use(cors());

var vlc;
var isVlcRunning = false;

// Função para mostrar notificações
function showNotification(title, body, type = 'info') {
    if (Notification.isSupported()) {
        const iconName = process.platform === 'win32' ? 'AudioGrid.ico' : 'AudioGrid.png';
        const notification = new Notification({
            title: title || i18nTexts.title || 'AudioGrid',
            body: body,
            icon: path.join(__dirname, iconName)
        });
        notification.show();
    }
    console.log(`[${type.toUpperCase()}] ${title}: ${body}`);
}

// Função para obter IP local de forma robusta
async function getLocalIP() {
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            for (const net of interfaces[name]) {
                if (net.family === 'IPv4' && !net.internal) {
                    return net.address;
                }
            }
        }
    } catch (error) {
        console.error(i18nTexts.error_unable_to_get_internal_ip, error);
    }
    return '127.0.0.1';
}

async function createVlc() {
    try {
        const password = uniqueString();
        localIP = await getLocalIP();
        if (!localIP) {
            localIP = '127.0.0.1';
        }

        const vlcExe = getVlcExecutablePath();
        const vlcHost = '127.0.0.1'; // sempre localhost para evitar firewall e não depender de LAN
        console.log('Executando VLC...', vlcExe);
        const instance = execa(vlcExe, [
            '--extraintf', 'http',
            '--intf', 'dummy',
            '--http-host', vlcHost,
            '--http-port', vlcPort.toString(),
            '--http-password', password,
            '--file-caching=10',
            '--live-caching=10',
            '--disc-caching=10',
            '--network-caching=50',
            '--no-audio-time-stretch'
        ]);

        const vlcInterface = {
            async info() {
                try {
                    return await got('requests/status.json', {
                        port: vlcPort,
                        password,
                        responseType: 'json',
                        prefixUrl: `http://${vlcHost}`,
                        resolveBodyOnly: true,
                        timeout: 5000
                    });
                } catch (error) {
                    throw new Error(i18nTexts.vlc_connection_error || 'Erro ao conectar com VLC');
                }
            },
            async playlist() {
                try {
                    return await got('requests/playlist.json', {
                        port: vlcPort,
                        password,
                        responseType: 'json',
                        prefixUrl: `http://${vlcHost}`,
                        resolveBodyOnly: true,
                        timeout: 5000
                    });
                } catch (error) {
                    throw new Error(i18nTexts.vlc_playlist_error || 'Erro ao obter playlist do VLC');
                }
            },
            async command(command, options = {}) {
                try {
                    await got(`requests/status.json?${new URLSearchParams({
                        command,
                        ...options,
                    }).toString().replace(/\+/g, '%20')}`, {
                        port: vlcPort,
                        password,
                        prefixUrl: `http://${vlcHost}`,
                        responseType: 'buffer',
                        timeout: 5000
                    });
                } catch (error) {
                    throw new Error(i18nTexts.vlc_command_error || `Erro ao executar comando VLC: ${command}`);
                }
            },
            kill() {
                try {
                    instance.kill();
                    isVlcRunning = false;
                } catch (error) {
                    console.error(i18nTexts.vlc_kill_error || 'Erro ao encerrar VLC:', error);
                }
            },
        };

        // Aguardar a interface HTTP do VLC (polling com retentativas; no Windows pode demorar)
        console.log('Aguardando VLC inicializar...');
        const maxAttempts = 10;
        const delayMs = 2000;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(r => setTimeout(r, attempt === 1 ? 3000 : delayMs));
            try {
                await vlcInterface.info();
                isVlcRunning = true;
                console.log('VLC pronto na tentativa', attempt);
                return vlcInterface;
            } catch (e) {
                if (attempt === maxAttempts) {
                    console.error('VLC não respondeu após', maxAttempts, 'tentativas');
                    throw new Error(i18nTexts.vlc_connection_error || 'Erro ao conectar com VLC');
                }
            }
        }
        throw new Error(i18nTexts.vlc_connection_error || 'Erro ao conectar com VLC');
    } catch (error) {
        throw error;
    }
}

async function playAudio(name, res) {
    try {
        // Validação de entrada
        if (!name || typeof name !== 'string') {
            /*const errorMsg = i18nTexts.error_mandatory_name_field || 'O parâmetro "name" é obrigatório.';
            showNotification(
                i18nTexts.error || 'Erro',
                errorMsg,
                'error'
            );*/
            return res.status(400).json({error: errorMsg});
        }

        // Sanitizar nome do arquivo
        const sanitizedName = path.basename(name);
        const audioPath = path.join(__dirname, 'audios', sanitizedName);
        
        // Verificar se arquivo existe
        if (!fs.existsSync(audioPath)) {
            const errorMsg = i18nTexts.error_file_not_found || 'Arquivo de áudio não encontrado.';
            showNotification(
                i18nTexts.error || 'Erro',
                errorMsg,
                'error'
            );
            return res.status(404).json({error: errorMsg});
        }

        // Verificar se VLC está rodando
        if (!isVlcRunning || !vlc) {
            const errorMsg = i18nTexts.vlc_not_running || 'VLC não está rodando.';
           /* showNotification(
                i18nTexts.error || 'Erro',
                errorMsg,
                'error'
            );*/
            return res.status(503).json({error: errorMsg});
        }

       /* showNotification(
            i18nTexts.stopping_audio || 'Parando áudio...',
            i18nTexts.stopping_audio_message || 'Interrompendo reprodução atual',
            'info'
        );*/

        try {
            await vlc.command('pl_stop');
            


            await vlc.command('in_play', {
                input: audioPath,
            });

            res.status(200).json({
                success: true,
                message: i18nTexts.audio_playing_success || 'Áudio reproduzido com sucesso',
                file: sanitizedName
            });

        } catch (vlcError) {
            console.error('Erro VLC:', vlcError);
            showNotification(
                i18nTexts.vlc_play_error || 'Erro ao reproduzir',
                vlcError.message || i18nTexts.vlc_play_error_message || 'Erro ao reproduzir áudio no VLC',
                'error'
            );
            res.status(500).json({
                error: i18nTexts.vlc_play_error || 'Erro ao reproduzir áudio no VLC',
                details: vlcError.message
            });
        }

    } catch (error) {
        console.error("playAudio exception:", error);
        showNotification(
            i18nTexts.error || 'Erro',
            error.message || i18nTexts.unknown_error || 'Erro desconhecido',
            'error'
        );
        res.status(500).json({
            error: i18nTexts.unknown_error || 'Erro interno do servidor',
            details: error.message
        });
    }
}

function getAudioNames(res) {
    try {
        const audioFolder = path.join(__dirname, 'audios');
        
        // Verificar se pasta existe
        if (!fs.existsSync(audioFolder)) {
            const errorMsg = i18nTexts.error_audios_folder_not_found || 'Pasta de áudios não encontrada.';
            showNotification(
                i18nTexts.error || 'Erro',
                errorMsg,
                'error'
            );
            return res.status(404).json({error: errorMsg});
        }

        fs.readdir(audioFolder, async (err, files) => {
            if (err) {
                console.error(i18nTexts.error_reading_audios_folder || 'Erro ao ler pasta de áudios:', err);
                showNotification(
                    i18nTexts.error || 'Erro',
                    i18nTexts.error_reading_audios_folder || 'Erro ao ler pasta de áudios',
                    'error'
                );
                return res.status(500).json({
                    error: i18nTexts.error_reading_audios_folder || 'Erro ao ler pasta de áudios'
                });
            }

            const audioNames = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return ['.mp3', '.ogg', '.oga', '.wav', '.m4a', '.flac'].includes(ext);
            });

            if (audioNames.length === 0) {
                showNotification(
                    i18nTexts.no_audio_files || 'Nenhum áudio encontrado',
                    i18nTexts.no_audio_files_message || 'Nenhum arquivo de áudio foi encontrado na pasta',
                    'warning'
                );
                return res.status(200).json({audioFiles: []});
            }

            const sortedAudioFileNames = audioNames.sort((a, b) => a.localeCompare(b));

            try {
                const promises = sortedAudioFileNames.map(async (audioName) => {
                    try {
                        const duration = await getAudioDurationInSeconds(path.join(audioFolder, audioName));
                        return {"name": audioName, "duration": duration};
                    } catch (durationError) {
                        console.warn(`Erro ao obter duração de ${audioName}:`, durationError);
                        return {"name": audioName, "duration": 0};
                    }
                });

                const audioFiles = await Promise.all(promises);
/*
                showNotification(
                    i18nTexts.audios_loaded || 'Áudios carregados',
                    `${i18nTexts.audios_loaded_message || 'Total de arquivos'}: ${audioFiles.length}`,
                    'success'
                );*/

                res.status(200).json({audioFiles});
            } catch (processingError) {
                console.error('Erro ao processar arquivos de áudio:', processingError);
                showNotification(
                    i18nTexts.error || 'Erro',
                    i18nTexts.error_processing_audio_files || 'Erro ao processar arquivos de áudio',
                    'error'
                );
                res.status(500).json({
                    error: i18nTexts.error_processing_audio_files || 'Erro ao processar arquivos de áudio'
                });
            }
        });

    } catch (error) {
        console.error("getAudioNames exception:", error);
        showNotification(
            i18nTexts.error || 'Erro',
            error.message || i18nTexts.unknown_error || 'Erro desconhecido',
            'error'
        );
        res.status(500).json({
            error: i18nTexts.unknown_error || 'Erro interno do servidor',
            details: error.message
        });
    }
}

function serveRemotePage(req, res) {
    try {
        const indexPath = path.join(__dirname, 'index.html');

        fs.readFile(indexPath, 'utf8', (err, data) => {
            if (err) {
                console.error(i18nTexts.error_reading_index || 'Erro ao ler index.html:', err);
                showNotification(
                    i18nTexts.error || 'Erro',
                    i18nTexts.error_reading_index || 'Erro ao ler arquivo HTML',
                    'error'
                );
                return res.status(500).send(i18nTexts.internal_server_error || 'Erro interno do servidor');
            }

            const modifiedContent = data.replace(/localhost/g, localIP);
            res.send(modifiedContent);
        });
    } catch (error) {
        console.error("serveRemotePage exception:", error);
        showNotification(
            i18nTexts.error || 'Erro',
            error.message || i18nTexts.unknown_error || 'Erro desconhecido',
            'error'
        );
        res.status(500).send(i18nTexts.internal_server_error || 'Erro interno do servidor');
    }
}

function startServer(callback) {
    const startServerCallback = callback || (() => {});
    try {
        // Middleware para logging de requisições
        expressApp.use((req, res, next) => {
            console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
            next();
        });

        // Endpoint para verificar status do servidor
        expressApp.get('/status', (req, res) => {
            res.status(200).json({
                status: 'running',
                vlc: isVlcRunning,
                ip: localIP,
                port: serverPort,
                timestamp: new Date().toISOString()
            });
        });

        // Funções relacionadas aos endpoints REST
        expressApp.post('/playAudio', (req, res) => {
            playAudio(req.body.name, res);
        });

        expressApp.get('/getAudioNames', (req, res) => {
            getAudioNames(res);
        });

        expressApp.get('/remote', (req, res) => {
            serveRemotePage(req, res);
        });

        // Endpoint para alternar a visibilidade da janela (permitindo atalho via script/curl no Wayland)
        expressApp.get('/window/toggle', (req, res) => {
            try {
                if (mainWindow) {
                    toggleWindow();
                    res.status(200).json({
                        success: true,
                        visible: mainWindow.isVisible()
                    });
                } else {
                    res.status(503).json({
                        success: false,
                        error: 'Janela principal não está pronta ou foi fechada.'
                    });
                }
            } catch (error) {
                console.error('Erro na rota /window/toggle:', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });


        // Middleware para tratamento de erros
        expressApp.use((error, req, res, next) => {
            console.error('Express error:', error);
            showNotification(
                i18nTexts.server_error || 'Erro do Servidor',
                error.message || i18nTexts.server_error_message || 'Erro interno do servidor',
                'error'
            );
            res.status(500).json({
                error: i18nTexts.server_error || 'Erro interno do servidor',
                details: error.message
            });
        });

        function onListenSuccess(boundHost, actualPort) {
            serverPort = actualPort;
            const hostForMessage = boundHost === '127.0.0.1' ? 'localhost' : localIP;
            const message = `${i18nTexts.server_running_in || 'Servidor rodando em'} http://${hostForMessage}:${serverPort}`;
            console.log(message);
            if (boundHost === '127.0.0.1' || actualPort !== preferredPort) {
                const portNote = actualPort !== preferredPort
                    ? ` Porta ${actualPort} (${preferredPort} indisponível).`
                    : '';
                showNotification(
                    i18nTexts.server_localhost_only_title || 'Servidor em localhost',
                    `${i18nTexts.server_localhost_only_message || 'Acesso de outros dispositivos na rede pode não estar disponível neste sistema.'}${portNote}`,
                    actualPort !== preferredPort ? 'info' : 'warning'
                );
            }
            startServerCallback(null, actualPort);
        }

        function onListenError(err, tryNext) {
            if (err.code === 'EACCES' && tryNext) {
                tryNext();
            } else {
                console.error("startServer exception:", err);
                showNotification(
                    i18nTexts.server_start_error || 'Erro ao Iniciar Servidor',
                    err.message || i18nTexts.server_start_error_message || 'Erro ao iniciar servidor',
                    'error'
                );
                startServerCallback(err);
            }
        }

        function tryListen(portToTry, host, onSuccess, onErrorWithNext) {
            const server = expressApp.listen(portToTry, host, () => onSuccess(host, portToTry));
            server.on('error', (err) => {
                server.close(() => onErrorWithNext(err));
            });
        }

        function tryDynamicPort() {
            getPort({ port: [3010, 3020, 3030, 3040, 3050, 3060, 3070, 3080, 3090] })
                .then((freePort) => {
                    tryListen(freePort, '127.0.0.1', (host, p) => onListenSuccess(host, p), (err) => {
                        onListenError(err, null);
                    });
                })
                .catch((err) => {
                    console.error("startServer getPort exception:", err);
                    showNotification(
                        i18nTexts.server_start_error || 'Erro ao Iniciar Servidor',
                        err.message || i18nTexts.server_start_error_message || 'Erro ao iniciar servidor',
                        'error'
                    );
                    startServerCallback(err);
                });
        }

        tryListen(preferredPort, '0.0.0.0', (host, p) => onListenSuccess(host, p), (err) => {
            if (err.code !== 'EACCES') return onListenError(err, null);
            tryListen(preferredPort, '127.0.0.1', (host, p) => onListenSuccess(host, p), (err2) => {
                if (err2.code !== 'EACCES') return onListenError(err2, null);
                tryDynamicPort();
            });
        });

    } catch (error) {
        console.error("startServer exception:", error);
        showNotification(
            i18nTexts.server_start_error || 'Erro ao Iniciar Servidor',
            error.message || i18nTexts.server_start_error_message || 'Erro ao iniciar servidor',
            'error'
        );
        startServerCallback(error);
    }
}

let mainWindow;
let nodeServerProcess;
let tray = null;

// Função para alternar visibilidade da janela
function toggleWindow() {
    try {
        if (!mainWindow) return;
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            mainWindow.focus();
        }
    } catch (error) {
        console.error('Erro ao alternar visibilidade da janela:', error);
    }
}

// Criar ícone da bandeja do sistema (Tray)
function createTray() {
    try {
        const iconName = process.platform === 'win32' ? 'AudioGrid.ico' : 'AudioGrid.png';
        const iconPath = path.join(__dirname, iconName);
        tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Mostrar / Ocultar',
                click: () => {
                    toggleWindow();
                }
            },
            { type: 'separator' },
            {
                label: i18nTexts.exit || 'Sair',
                click: () => {
                    app.quit();
                }
            }
        ]);
        tray.setToolTip('AudioGrid');
        tray.setContextMenu(contextMenu);
        
        tray.on('click', () => {
            toggleWindow();
        });
    } catch (error) {
        console.error('Erro ao criar tray icon:', error);
    }
}

function createWindow(serverPortForRenderer) {
    try {
        // Obter configuração do monitor
        const monitors = getAvailableMonitors();
        const targetMonitor = monitors[appConfig.monitor || 0];
        const { x, y, width, height } = targetMonitor ? targetMonitor.bounds : { x: 0, y: 0, width: 1920, height: 1080 };

        const iconName = process.platform === 'win32' ? 'AudioGrid.ico' : 'AudioGrid.png';
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            x: x,
            y: y,
            frame: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true
            },
            alwaysOnTop: true,
            icon: path.join(__dirname, iconName)
        });
        
        // Intercept window.open() to prevent use-after-free vulnerabilities (CVE-2026-34774)
        mainWindow.webContents.setWindowOpenHandler((details) => {
            try {
                shell.openExternal(details.url);
            } catch (err) {
                console.error('Erro ao abrir link externo:', err);
            }
            return { action: 'deny' };
        });

        // Fechar/ocultar janela ao pressionar Escape
        mainWindow.webContents.on('before-input-event', (event, input) => {
            if (input.key === 'Escape' && input.type === 'keyDown') {
                mainWindow.hide();
                event.preventDefault();
            }
        });
        
        mainWindow.maximize();
        mainWindow.loadFile('index.html');
        mainWindow.webContents.once('did-finish-load', () => {
            if (serverPortForRenderer != null) {
                mainWindow.webContents.send('server-port', serverPortForRenderer);
            }
        });
        
        mainWindow.on('closed', function () {
            try {
                if (nodeServerProcess) {
                    nodeServerProcess.kill();
                }
                if (vlc) {
                    vlc.kill();
                }
                mainWindow = null;
            } catch (error) {
                console.error('Erro ao fechar janela:', error);
            }
        });

        const contextMenuTemplate = [
            {
                label: i18nTexts.title || 'AudioGrid',
            },
            {type: 'separator'},
            {
                label: i18nTexts.open_web_page || 'Abrir página WEB',
                click: () => {
                    try {
                        mainWindow.hide();
                        shell.openExternal(`http://${localIP}:${serverPort}/remote`);

                    } catch (error) {
                        console.error('Erro ao abrir página web:', error);
                        showNotification(
                            i18nTexts.error || 'Erro',
                            i18nTexts.web_page_error || 'Erro ao abrir página web',
                            'error'
                        );
                    }
                },
            },
            {
                label: i18nTexts.open_audios_folder || 'Abrir pasta "audios"',
                click: () => {
                    try {
                        const audiosFolder = path.join(__dirname, 'audios');
                        mainWindow.hide();
                        shell.showItemInFolder(audiosFolder);

                    } catch (error) {
                        console.error('Erro ao abrir pasta:', error);
                        showNotification(
                            i18nTexts.error || 'Erro',
                            i18nTexts.folder_error || 'Erro ao abrir pasta de áudios',
                            'error'
                        );
                    }
                },
            },
            {
                label: i18nTexts.reload || 'Recarregar áudios',
                click: () => {
                    try {
                        mainWindow.reload();

                    } catch (error) {
                        console.error('Erro ao recarregar:', error);
                        showNotification(
                            i18nTexts.error || 'Erro',
                            i18nTexts.reload_error || 'Erro ao recarregar',
                            'error'
                        );
                    }
                },
            },
            {type: 'separator'},
            {
                label: i18nTexts.configure_shortcut || 'Configurar Atalho',
                click: () => {
                    try {
                        if (mainWindow) {
                            mainWindow.webContents.send('open-shortcut-modal');
                        }
                    } catch (error) {
                        console.error('Erro ao abrir modal de atalho:', error);
                        showNotification(
                            i18nTexts.error || 'Erro',
                            i18nTexts.shortcut_config_error || 'Erro ao configurar atalho',
                            'error'
                        );
                    }
                },
            },
            {
                label: i18nTexts.switch_monitor || 'Trocar Monitor',
                click: () => {
                    try {
                        showMonitorDialog();
                    } catch (error) {
                        console.error('Erro ao trocar monitor:', error);
                        showNotification(
                            i18nTexts.error || 'Erro',
                            i18nTexts.monitor_change_error || 'Erro ao trocar monitor',
                            'error'
                        );
                    }
                },
            },
            {
                label: i18nTexts.help || 'Ajuda',
                submenu: [
                    {
                        label: i18nTexts.help_zoom || 'Zoom: Ctrl + Scroll do mouse'
                    },
                    {
                        label: (i18nTexts.help_show_hide || 'Mostrar/Esconder: ') + appConfig.shortcuts.showHide
                    },
                    {
                        label: (i18nTexts.help_current_monitor || 'Monitor atual: ') + (getAvailableMonitors()[appConfig.monitor || 0]?.label || 'Monitor 1')
                    },
                    {
                        label: i18nTexts.help_web_interface || 'Interface Web: Disponível na rede local'
                    }
                ]
            },
            {type: 'separator'},
            {
                label: i18nTexts.exit || 'Sair',
                click: () => {
                    try {

                        app.quit();
                    } catch (error) {
                        console.error('Erro ao fechar aplicativo:', error);
                        app.quit();
                    }
                },
            },
        ];

        const contextMenuInstance = Menu.buildFromTemplate(contextMenuTemplate);
        mainWindow.webContents.on('context-menu', () => {
            contextMenuInstance.popup({window: mainWindow});
        });

        mainWindow.webContents.setZoomFactor(1.0);

        mainWindow.webContents
            .setVisualZoomLevelLimits(1, 5)
            .catch((err) => {
                console.error('Erro ao definir limites de zoom:', err);
            });

        mainWindow.webContents.on("zoom-changed", (event, zoomDirection) => {
            try {
                const currentZoom = mainWindow.webContents.getZoomFactor();

                if (zoomDirection === "in") {
                    mainWindow.webContents.zoomFactor = Math.min(currentZoom + 0.01, 5);
                }
                if (zoomDirection === "out") {
                    mainWindow.webContents.zoomFactor = Math.max(currentZoom - 0.01, 1);
                }
            } catch (error) {
                console.error('Erro ao alterar zoom:', error);
            }
        });

    } catch (error) {
        console.error("createWindow exception:", error);
        showNotification(
            i18nTexts.window_error || 'Erro na Janela',
            error.message || i18nTexts.window_error_message || 'Erro ao criar janela principal',
            'error'
        );
    }
}

app.whenReady().then(async () => {
    try {
        // Verificar VLC: se já temos caminho completo (ex.: C:\...\vlc.exe), pular --version (no Windows costuma travar)
        const vlcExe = getVlcExecutablePath();
        const skipVersionCheck = platform === 'win32' && (path.isAbsolute(vlcExe) || vlcExe.includes(path.sep));
        if (!skipVersionCheck) {
            try {
                console.log('Verificando VLC...', vlcExe);
                await Promise.race([
                    execa(vlcExe, ['--version']),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
                ]);
                console.log('VLC encontrado!');
            } catch (vlcCheckError) {
                console.log('VLC não encontrado ou timeout:', vlcCheckError.message);
            }
        } else {
            console.log('VLC (caminho conhecido):', vlcExe);
        }

        console.log('Iniciando VLC...');
        try {
            vlc = await createVlc();
        } catch (vlcError) {
            console.log('VLC falhou ao inicializar, continuando sem VLC:', vlcError.message);
            vlc = null;
            isVlcRunning = false;

        }
        
        console.log('Iniciando servidor...');
        startServer((err, port) => {
            if (err) return;
            console.log('Criando janela...');
            createWindow(port);
            createTray();
            // Registrar atalho após a janela existir
            registerShortcut(appConfig.shortcuts.showHide, toggleWindow);
        });

    } catch (error) {
        console.error("app.whenReady exception:", error);
        showNotification(
            i18nTexts.app_start_error || 'Erro ao Iniciar',
            error.message || i18nTexts.app_start_error_message || 'Erro ao iniciar aplicativo',
            'error'
        );
    }
});

app.on('window-all-closed', function () {
    try {
        if (process.platform !== 'darwin') {
            if (vlc) {
                vlc.kill();
            }
            app.quit();
        }
    } catch (error) {
        console.error('Erro ao fechar aplicativo:', error);
        app.quit();
    }
});

app.on('activate', function () {
    try {
        if (mainWindow === null) {
            createWindow(serverPort);
        }
    } catch (error) {
        console.error("activate exception:", error);
        showNotification(
            i18nTexts.activate_error || 'Erro de Ativação',
            error.message || i18nTexts.activate_error_message || 'Erro ao ativar aplicativo',
            'error'
        );
    }
});

app.on('will-quit', async () => {
    try {
        globalShortcut.unregisterAll();
        if (vlc) {
            vlc.kill();
        }
    } catch (error) {
        console.error("will-quit exception:", error);
    }
});
