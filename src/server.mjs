import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
//import player from 'play-sound')(;
import cors from 'cors';
import {getAudioDurationInSeconds} from 'get-audio-duration';
import ip from 'ip';

import {playAudioFile} from 'audic';

const app = express();
const port = 3000;
const localIP = ip.address();
app.use(bodyParser.json());
app.use(cors());

let currentAudio = null;

export class AudioModule {

    public playAudio(name, res) {
        if (!name) {
            return res.status(400).json({error: 'O parâmetro "name" é obrigatório.'});
        }

        const audioPath = path.join(__dirname, 'audios', name);

        if (!fs.existsSync(audioPath)) {
            return res.status(404).json({error: 'Arquivo de áudio não encontrado.'});
        }

        if (currentAudio) {
            currentAudio.destroy();
        }

        currentAudio = playAudioFile(audioPath);

        /*if (currentAudio) {
            currentAudio.kill();
        }

        currentAudio = player.play(audioPath, (err) => {
            if (err) {
                console.error('Erro ao reproduzir áudio:', err);
                return res.status(500).json({error: 'Erro ao reproduzir áudio.'});
            }

            res.status(200).json({message: 'Áudio reproduzido com sucesso.'});
        });*/
    }

    public getAudioNames(res) {
        const audioFolder = path.join(__dirname, 'audios');

        fs.readdir(audioFolder, async (err, files) => {
            if (err) {
                console.error('Erro ao ler a pasta de áudios:', err);
                return res.status(500).json({error: 'Erro ao obter nomes de áudio.'});
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
    }

    public serveRemotePage(req, res) {
        const indexPath = path.join(__dirname, '../index.html');

        fs.readFile(indexPath, 'utf8', (err, data) => {
            if (err) {
                console.error('Erro ao ler o arquivo index.html:', err);
                res.status(500).send('Erro interno do servidor');
            } else {
                const modifiedContent = data.replace(/localhost/g, localIP);
                res.send(modifiedContent);
            }
        });
    }

    public startServer() {
        // Funções relacionadas aos endpoints REST
        app.post('/playAudio', (req, res) => {
            this.playAudio(req.body.name, res);
        });

        app.get('/getAudioNames', (req, res) => {
            this.getAudioNames(res);
        });

        app.get('/remote', (req, res) => {
            this.serveRemotePage(req, res);
        });
        app.listen(port, () => {
            console.log(`Servidor escutando em http://${localIP}:${port}`);
        });
    }
}

