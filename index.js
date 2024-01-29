import {app, BrowserWindow, globalShortcut, Menu, shell} from 'electron'
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
const i18nPath = path.join(__dirname, 'i18n.properties');
const expressApp = express();
const port = 3000;
const localIP = ip.address();
expressApp.use(bodyParser.json());
expressApp.use(cors());

var vlc;

async function createVlc() {
    const password = uniqueString();
    const ip = await internalIp.v4();
    const port = await getPort();
    if (!ip) {
        throw new Error('Unable to get internal IP address');
    }
    const address = `http://${ip}`;
    console.log(ip);
    console.log(port);
    const instance = execa('vlc', ['--extraintf', 'http', '--intf', 'dummy', '--http-host', ip, '--http-port', port.toString(), '--http-password', password]);

    return {
        async info() {
            return got('requests/status.json', {
                port,
                password,
                responseType: 'json',
                prefixUrl: address,
                resolveBodyOnly: true,
            });
        },
        async playlist() {
            return got('requests/playlist.json', {
                port,
                password,
                responseType: 'json',
                prefixUrl: address,
                resolveBodyOnly: true,
            });
        },
        async command(command, options) {
            await got(`requests/status.json?${new URLSearchParams({
                command,
                ...options,
            }).toString().replace(/\+/g, '%20')}`, {
                port,
                password,
                prefixUrl: address,
                responseType: 'buffer',
            });
        },
        kill() {
            instance.kill();
        },
    };
}

async function playAudio(name, res) {
    try {
        if (!name) {
            return res.status(400).json({error: 'O parâmetro "name" é obrigatório.'});
        }
        console.log("Directory name: " + __dirname);
        const audioPath = path.join(__dirname, 'audios', name);
        console.log(audioPath);
        if (!fs.existsSync(audioPath)) {
            return res.status(404).json({error: 'Arquivo de áudio não encontrado.'});
        }

        console.log('Stoping audio...');

        try {
            vlc.command('pl_stop').then(() => {
                console.log('Playing new audio...');
                // Play audio
                vlc.command('in_play', {
                    input: audioPath,
                });
            });
        } catch (err) {
            vlc.command('in_play', {
                input: audioPath,
            });
        }
    } catch (err) {
        console.log("playAudio exception: ");
        console.log(err);
    }
}

function getAudioNames(res) {
    try {
        const audioFolder = path.join(__dirname, 'audios');
        console.log("audio folder: " + audioFolder);
        fs.readdir(audioFolder, async (err, files) => {
            if (err) {
                console.error('Error reading audios folder:', err);
                return res.status(500).json({error: 'Error getting audio names.'});
            }

            const audioNames = files.filter(file => file.endsWith('.mp3') || file.endsWith('.ogg') || file.endsWith('.oga'));

            const sortedAudioFileNames = audioNames.sort((a, b) => a.localeCompare(b));

            const promises = sortedAudioFileNames.map(async (audioName) => {
                const duration = await getAudioDurationInSeconds(path.join(audioFolder, audioName));
                return {"name": audioName, "duration": duration};
            });

            const audioFiles = await Promise.all(promises);

            res.status(200).json({audioFiles});
        });
        console.log("after reading folder!");
    } catch (err) {
        console.log("getAudioNames exception: ");
        console.log(err);
    }
}

function serveRemotePage(req, res) {
    const indexPath = path.join(__dirname, 'index.html');

    fs.readFile(indexPath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading index.html:', err);
            res.status(500).send('Intern server error');
        } else {
            const modifiedContent = data.replace(/localhost/g, localIP);
            res.send(modifiedContent);
        }
    });
}

function parseProperties(propertiesString) {
    try {
        const properties = {};
        propertiesString.split('\n').forEach((line) => {
            const [key, value] = line.split('=');
            if (key && value) {
                properties[key.trim()] = value.trim();
            }
        });
        return properties;
    } catch (err) {
        console.log("parseProperties exception: ");
        console.log(err);
    }
}

function startServer() {
    try {
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
        expressApp.listen(port, () => {
            console.log(`Server running in http://${localIP}:${port}`);
        });
    } catch (err) {
        console.log("startServer exception: ");
        console.log(err);
    }
}

const i18nTexts = fs.existsSync(i18nPath)
    ? parseProperties(fs.readFileSync(i18nPath, 'utf-8'))
    : {};

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
            },
            alwaysOnTop: true,
        });
        mainWindow.maximize();
        mainWindow.loadFile('index.html');
        mainWindow.on('closed', function () {
            if (nodeServerProcess) {
                nodeServerProcess.kill();
            }
            mainWindow = null;
        });

        const localIP = ip.address();
        const contextMenuTemplate = [
            {
                label: i18nTexts.title,
            },
            {type: 'separator'},
            {
                label: i18nTexts.open_web_page,
                click: () => {
                    mainWindow.hide();
                    shell.openExternal(`http://${localIP}:3000/remote`);
                },
            },
            {
                label: i18nTexts.open_audios_folder,
                click: () => {
                    if (platform === 'win32') {
                        const audiosFolder = path.join(__dirname, 'audios/p');
                        mainWindow.hide();
                        shell.showItemInFolder(audiosFolder);
                    }
                    if (platform === 'linux') {
                        const audiosFolder = path.join(__dirname, 'audios/p/e');
                        mainWindow.hide();
                        shell.showItemInFolder(audiosFolder);
                    }
                },
            },
            {
                label: i18nTexts.reload,
                click: () => {
                    mainWindow.reload();
                },
            },
            {type: 'separator'},
            {
                label: i18nTexts.help,
                submenu: [
                    {
                        label: i18nTexts.help_zoom
                    },
                    {
                        label: i18nTexts.help_show_hide
                    },
                    {
                        label: i18nTexts.help_web_interface
                    }
                ]
            },
            {type: 'separator'},
            {
                label: i18nTexts.exit,
                click: () => {
                    app.quit();
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
            .catch((err) => console.log(err));

        mainWindow.webContents.on("zoom-changed", (event, zoomDirection) => {
            console.log(zoomDirection);
            const currentZoom = mainWindow.webContents.getZoomFactor();
            console.log("Current Zoom Factor - ", currentZoom);
            console.log("Current Zoom Level at - ", mainWindow.webContents.zoomLevel);

            if (zoomDirection === "in") {
                mainWindow.webContents.zoomFactor = currentZoom + 0.01;

                console.log("Zoom Factor Increased to - "
                    , mainWindow.webContents.zoomFactor * 100, "%");
            }
            if (zoomDirection === "out") {
                mainWindow.webContents.zoomFactor = currentZoom - 0.01;

                console.log("Zoom Factor Decreased to - "
                    , mainWindow.webContents.zoomFactor * 100, "%");
            }
        });
    } catch (err) {
        console.log("createWindow exception: ");
        console.log(err);
    }
}

app.whenReady().then(async () => {
    try {
        vlc = await createVlc();
        // Remova o código de inicialização do servidor Node.js aqui

        // Inicializa o módulo Node.js
        startServer();

        // Cria a janela principal
        createWindow();
        globalShortcut.register('F3', () => {
            if (mainWindow.isVisible()) {
                //mainWindow.blur(); // Remove o foco da janela do Electron
                mainWindow.hide();
                //app.focus(); // Dá foco à aplicação ativa anterior
            } else {
                //app.focus(); // Dá foco à aplicação ativa anterior
                mainWindow.show();
            }
        });

    } catch (err) {
        console.log("app.whenReady exception: ");
        console.log(err);
    }
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    try {
        if (mainWindow === null) createWindow();
    } catch (err) {
        console.log("activate exception: ");
        console.log(err);
    }
});

app.on('will-quit', () => {
    try {
        globalShortcut.unregisterAll();
    } catch (err) {
        console.log("will-quit exception: ");
        console.log(err);
    }
});
