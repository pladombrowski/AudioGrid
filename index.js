import {app, BrowserWindow, globalShortcut, Menu, shell, Notification, dialog} from 'electron'
import path from 'path'
import ip from 'ip';
import fs from 'fs';
import express from 'express';
import bodyParser from 'body-parser';
import uniqueString from 'unique-string';
import internalIp from 'internal-ip';
import getPort from 'get-port';
import execa from 'execa';
import got from 'got';
import {platform} from 'node:process';
import cors from 'cors';
import {getAudioDurationInSeconds} from 'get-audio-duration';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('=== AUDIOGRID INICIANDO ===');
console.log('Diretório:', __dirname);

const i18nPath = path.join(__dirname, 'i18n.properties');
const configPath = path.join(__dirname, 'config.json');
const expressApp = express();
const port = 3000;
const vlcPort = 3001; // Porta diferente para o VLC
let localIP = 'localhost';

// Configurações padrão
const defaultConfig = {
    shortcut: 'F3',
    shortcuts: {
        showHide: 'F3'
    }
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
            return false;
        }
    } catch (error) {
        console.error(`Erro ao registrar atalho ${shortcut}:`, error);
        return false;
    }
}

// Função para mostrar diálogo de configuração de atalho
function showShortcutDialog() {
    const options = {
        type: 'question',
        buttons: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12', 'Cancelar'],
        defaultId: 2, // F3 como padrão
        title: 'Configurar Atalho',
        message: 'Selecione o atalho para mostrar/esconder a janela:',
        detail: 'Atalho atual: ' + appConfig.shortcuts.showHide
    };

    dialog.showMessageBox(mainWindow, options).then((result) => {
        if (result.response < 12) { // Não é "Cancelar"
            const newShortcut = options.buttons[result.response];
            
            // Atualizar configuração
            appConfig.shortcuts.showHide = newShortcut;
            appConfig.shortcut = newShortcut; // Manter compatibilidade
            
            // Salvar configuração
            if (saveConfig(appConfig)) {
                // Registrar novo atalho
                registerShortcut(newShortcut, () => {
                    try {
                        if (mainWindow.isVisible()) {
                            mainWindow.hide();
                        } else {
                            mainWindow.show();
                        }
                    } catch (error) {
                        console.error('Erro ao alternar visibilidade:', error);
                    }
                });
                
                showNotification(
                    i18nTexts.shortcut_configured || 'Atalho Configurado',
                    `${i18nTexts.shortcut_configured_message || 'Atalho alterado para'}: ${newShortcut}`,
                    'success'
                );
            } else {
                showNotification(
                    i18nTexts.error || 'Erro',
                    i18nTexts.shortcut_config_save_error || 'Falha ao salvar configuração',
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
        const notification = new Notification({
            title: title || i18nTexts.title || 'AudioGrid',
            body: body,
            icon: path.join(__dirname, 'AudioGrid.ico')
        });
        notification.show();
    }
    console.log(`[${type.toUpperCase()}] ${title}: ${body}`);
}

// Função para obter IP local de forma robusta
async function getLocalIP() {
    try {
        const internalIP = await internalIp.v4();
        if (internalIP) {
            return internalIP;
        }
        return ip.address();
    } catch (error) {
        console.error(i18nTexts.error_unable_to_get_internal_ip, error);
        return ip.address();
    }
}

async function createVlc() {
    try {
        const password = uniqueString();
        localIP = await getLocalIP();
        
        if (!localIP) {
            throw new Error(i18nTexts.error_unable_to_get_internal_ip);
        }
/*
        showNotification(
            i18nTexts.vlc_starting || 'Iniciando VLC...',
            `${i18nTexts.vlc_starting_message || 'Conectando ao VLC em'} ${localIP}:${vlcPort}`,
            'info'
        );*/

        console.log('Executando VLC...');
        const instance = execa('vlc', [
            '--extraintf', 'http', 
            '--intf', 'dummy', 
            '--http-host', localIP, 
            '--http-port', vlcPort.toString(), 
            '--http-password', password
        ]);

        // Aguardar um pouco para o VLC inicializar com timeout
        console.log('Aguardando VLC inicializar...');
        await Promise.race([
            new Promise(resolve => setTimeout(resolve, 5000)),
            new Promise((_, reject) => setTimeout(() => reject(new Error('VLC timeout')), 10000))
        ]);

        const vlcInterface = {
            async info() {
                try {
                    return await got('requests/status.json', {
                        port: vlcPort,
                        password,
                        responseType: 'json',
                        prefixUrl: `http://${localIP}`,
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
                        prefixUrl: `http://${localIP}`,
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
                        prefixUrl: `http://${localIP}`,
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

        // Testar conexão
        try {
            await vlcInterface.info();
            isVlcRunning = true;

        } catch (error) {

        }

        return vlcInterface;
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

function startServer() {
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
                port: port,
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

        expressApp.listen(port, () => {
            const message = `${i18nTexts.server_running_in || 'Servidor rodando em'} http://${localIP}:${port}`;
            console.log(message);

        });

    } catch (error) {
        console.error("startServer exception:", error);
        showNotification(
            i18nTexts.server_start_error || 'Erro ao Iniciar Servidor',
            error.message || i18nTexts.server_start_error_message || 'Erro ao iniciar servidor',
            'error'
        );
    }
}

let mainWindow;
let nodeServerProcess;

function createWindow() {
    try {
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            frame: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            },
            alwaysOnTop: true,
            icon: path.join(__dirname, 'AudioGrid.ico')
        });
        
        mainWindow.maximize();
        mainWindow.loadFile('index.html');
        
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
                        shell.openExternal(`http://${localIP}:${port}/remote`);

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
                        showShortcutDialog();
                    } catch (error) {
                        console.error('Erro ao configurar atalho:', error);
                        showNotification(
                            i18nTexts.error || 'Erro',
                            i18nTexts.shortcut_config_error || 'Erro ao configurar atalho',
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
        // Verificar se VLC está instalado (com timeout)
        try {
            console.log('Verificando VLC...');
            await Promise.race([
                execa('vlc', ['--version']),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);
            console.log('VLC encontrado!');
        } catch (vlcCheckError) {
            console.log('VLC não encontrado ou timeout:', vlcCheckError.message);

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
        startServer();
        
        console.log('Criando janela...');
        createWindow();
        
        // Registrar atalho dinâmico
        registerShortcut(appConfig.shortcuts.showHide, () => {
            try {
                if (mainWindow.isVisible()) {
                    mainWindow.hide();
                } else {
                    mainWindow.show();
                }
            } catch (error) {
                console.error('Erro ao alternar visibilidade:', error);
            }
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
            createWindow();
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

app.on('will-quit', () => {
    try {
        globalShortcut.unregisterAll();
        if (vlc) {
            vlc.kill();
        }
    } catch (error) {
        console.error("will-quit exception:", error);
    }
});
