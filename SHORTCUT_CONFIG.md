# Configuração de Atalhos Dinâmicos - AudioGrid

## Funcionalidades Implementadas

### 1. Sistema de Configuração Persistente
- **Arquivo de configuração**: `config.json`
- **Localização**: Mesmo diretório do executável
- **Formato**: JSON com estrutura hierárquica

### 2. Interface de Configuração
- **Menu de contexto**: Clique com botão direito na janela principal
- **Opção**: "Configurar Atalho"
- **Diálogo**: Seleção entre F1-F12

### 3. Atalhos Suportados
- F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12
- Atalho padrão: F3 (mantém compatibilidade)

### 4. Funcionalidades
- **Registro dinâmico**: Atalhos são registrados/desregistrados automaticamente
- **Persistência**: Configurações são salvas automaticamente
- **Notificações**: Feedback visual quando atalho é alterado
- **Menu de ajuda**: Mostra atalho atual dinamicamente

## Como Usar

1. **Configurar atalho**:
   - Clique com botão direito na janela principal
   - Selecione "Configurar Atalho"
   - Escolha o atalho desejado (F1-F12)
   - Confirme a seleção

2. **Verificar atalho atual**:
   - Clique com botão direito na janela principal
   - Vá em "Ajuda" → "Mostrar/Esconder: [ATALHO_ATUAL]"

3. **Arquivo de configuração**:
   - Localizado em `config.json`
   - Pode ser editado manualmente se necessário
   - Estrutura:
     ```json
     {
       "shortcut": "F3",
       "shortcuts": {
         "showHide": "F3"
       }
     }
     ```

## Estrutura do Código

### Funções Principais
- `loadConfig()`: Carrega configurações do arquivo
- `saveConfig(config)`: Salva configurações no arquivo
- `registerShortcut(shortcut, callback)`: Registra atalho global
- `showShortcutDialog()`: Mostra diálogo de configuração

### Arquivos Modificados
- `index.js`: Lógica principal do sistema
- `i18n.properties`: Strings de internacionalização
- `config.json`: Arquivo de configuração (criado automaticamente)

## Compatibilidade
- Mantém compatibilidade com versões anteriores
- Atalho padrão F3 preservado
- Sistema de fallback para configurações corrompidas
