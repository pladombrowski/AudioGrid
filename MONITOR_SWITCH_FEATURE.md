# Feature: Trocar Overlay para Outro Monitor

## Descrição
Esta feature permite que o usuário troque o overlay do AudioGrid para qualquer monitor disponível no sistema, facilitando o uso em configurações com múltiplos monitores.

## Como Usar

### 1. Acesso ao Menu
- Clique com o botão direito na janela do AudioGrid para abrir o menu de contexto
- Selecione "Trocar Monitor" no menu

### 2. Seleção do Monitor
- Um diálogo será exibido mostrando todos os monitores disponíveis
- Cada monitor será identificado como "Monitor X" (onde X é o número do monitor)
- O monitor principal será marcado como "(Principal)"
- Selecione o monitor desejado e clique em "OK"

### 3. Confirmação
- O overlay será movido automaticamente para o monitor selecionado
- Uma notificação confirmará a mudança
- A configuração será salva automaticamente

## Funcionalidades Implementadas

### Detecção Automática de Monitores
- O sistema detecta automaticamente todos os monitores conectados
- Obtém informações como resolução, posição e escala de cada monitor
- Identifica qual é o monitor principal

### Configuração Persistente
- A seleção do monitor é salva no arquivo `config.json`
- O overlay sempre abrirá no último monitor selecionado
- Configuração é mantida entre reinicializações do aplicativo

### Interface Intuitiva
- Menu de contexto com opção "Trocar Monitor"
- Diálogo de seleção com lista clara dos monitores disponíveis
- Notificações de confirmação e erro
- Informação do monitor atual no menu de ajuda

### Tratamento de Erros
- Verifica se há múltiplos monitores antes de mostrar a opção
- Trata casos onde apenas um monitor está disponível
- Exibe mensagens de erro apropriadas em caso de falha

## Arquivos Modificados

### `index.js`
- Adicionado import do módulo `screen` do Electron
- Implementadas funções:
  - `getAvailableMonitors()`: Detecta monitores disponíveis
  - `switchToMonitor(monitorId)`: Troca para monitor específico
  - `showMonitorDialog()`: Exibe diálogo de seleção
- Modificada função `createWindow()` para usar monitor configurado
- Adicionada opção "Trocar Monitor" no menu de contexto
- Adicionada informação do monitor atual no menu de ajuda

### `config.json`
- Adicionada propriedade `monitor` com valor padrão `0`

### `i18n.properties`
- Adicionadas mensagens de internacionalização para a nova feature:
  - `switch_monitor`: "Trocar Monitor"
  - `monitor_changed`: "Monitor Alterado"
  - `monitor_changed_message`: "Overlay movido para"
  - `monitor_change_error`: "Erro ao trocar monitor"
  - `no_multiple_monitors`: "Apenas um monitor"
  - `no_multiple_monitors_message`: "Apenas um monitor foi detectado"
  - `help_current_monitor`: "Monitor atual"

## Compatibilidade
- Funciona em Windows e Linux
- Compatível com configurações de múltiplos monitores
- Mantém compatibilidade com versões anteriores (monitor padrão = 0)
- Funciona com monitores de diferentes resoluções e escalas

## Limitações
- Requer pelo menos 2 monitores para a funcionalidade ser útil
- Se apenas 1 monitor estiver disponível, a opção não será exibida
- A mudança de monitor é instantânea e pode ser confusa se o usuário não souber onde procurar

## Testes Recomendados
1. Testar com 2 monitores conectados
2. Testar com diferentes resoluções de monitor
3. Testar persistência da configuração após reinicialização
4. Testar comportamento com apenas 1 monitor
5. Testar com monitores desconectados/reconectados
