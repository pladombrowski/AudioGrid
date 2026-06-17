#!/usr/bin/env node

// Script de teste para verificar se o AudioMixer está funcionando
import AudioMixer from './audio-mixer.js';

console.log('=== TESTE DO AUDIOMIXER ===');
console.log('');

const audioMixer = new AudioMixer();

async function testAudioMixer() {
    try {
        console.log('🔍 Testando detecção de dispositivos...');
        const devices = await audioMixer.getAudioDevices();
        
        console.log('✅ Dispositivos detectados:');
        console.log(`📥 Microfones: ${devices.inputs.length}`);
        devices.inputs.forEach((device, index) => {
            console.log(`  ${index + 1}. ${device.name} (${device.id})`);
        });
        
        console.log(`📤 Alto-falantes: ${devices.outputs.length}`);
        devices.outputs.forEach((device, index) => {
            console.log(`  ${index + 1}. ${device.name} (${device.id})`);
        });
        
        console.log('');
        console.log('🔧 Testando status da mixagem...');
        const status = audioMixer.getStatus();
        console.log('Status:', status);
        
        console.log('');
        console.log('✅ TESTE CONCLUÍDO COM SUCESSO!');
        console.log('');
        console.log('Agora você pode:');
        console.log('1. Executar o AudioGrid: ./AudioGrid');
        console.log('2. Ir em Mixagem de Áudio → Configurar Dispositivos');
        console.log('3. Selecionar seus dispositivos de áudio');
        console.log('4. Iniciar a mixagem');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

testAudioMixer();

