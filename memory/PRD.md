# HP 12C Calculator — Product Requirements Document

## Visão Geral
Aplicativo mobile (Expo / React Native) que simula a calculadora financeira HP 12C, com modos RPN e Algébrico, tema clássico (réplica) e moderno (escuro), interface em português, histórico de cálculos e memória persistente.

## Funcionalidades Implementadas

### Modos de Operação
- **RPN** (Reverse Polish Notation): pilha de 4 níveis (X, Y, Z, T) + LastX
- **ALG** (Algébrico): notação tradicional com tecla `=` adicional
- Alternância via botão `RPN/ALG` na barra superior

### Temas Visuais
- **Clássico**: réplica HP 12C — corpo escuro, bisel dourado/champagne, LCD verde (#9CB089), texto escuro
- **Moderno**: tema escuro premium — preto obsidiana, botões neumórficos planos, texto branco
- Alternância via botão `Clássico/Moderno`

### Operações Aritméticas
- `+`, `−`, `×`, `÷`, `1/x`, `%`, `√x` (f+÷), `x²` (g+÷), `yˣ` (f+1), `ln` (g+1), `eˣ` (g+2), `x!` (f+0)
- `CHS` (troca de sinal), `CLx` (limpa X), `⌫` (backspace)
- Operações de pilha: `ENTER`, `x↔y`, `R↓`, `LSTx` (g+ENTER), `π` (g+EEX)

### Funções Financeiras (HP 12C completas)
- **TVM Solver** (`n`, `i`, `PV`, `PMT`, `FV`): armazena se digitando, calcula se tecla acionada sem entrada
- **Juros simples** (`f+i` — INT): retorna base 360 e 365 dias
- **Amortização** (`f+n` — AMORT): dado nº de parcelas em X, retorna juros, principal e novo saldo
- **NPV** (`f+PV`): valor presente líquido sobre fluxos de caixa
- **IRR** (`f+FV`): taxa interna de retorno (Newton-Raphson)
- **Cash Flows**: `CFo` (g+PV), `CFj` (g+PMT), `Nj` (g+FV) para repetição
- **Depreciação**: `SL` (f+4), `SOYD` (f+5), `DDB` (f+6) — usa PV=custo, FV=salvage, n=vida útil
- **Δ%** (g+CLx), **%T** (g+9), `12×` (g+n), `12÷` (g+i)
- **RND** (f+PMT): arredonda X para a precisão de exibição

### Memória & Persistência
- 10 registradores de uso geral `R0..R9` via `STO`/`RCL` + dígito
- `Σ+`: estatística (acumula em R1..R6)
- Persistência via AsyncStorage: pilha, registradores financeiros, memória, histórico (até 50), modo, tema
- Modal "Memória & Registradores" lista todos os valores com opção de limpar

### Histórico
- Modal "Histórico" lista até 100 cálculos recentes com rótulo e resultado
- Botão "Limpar" para apagar

### Ajuda Integrada
- Modal "Ajuda Rápida" em português com explicações de modos, teclas financeiras, modificadoras f/g e exemplos práticos (financiamento, NPV/IRR, depreciação, amortização)

### Interação
- Haptic feedback (impacto leve) em cada toque de tecla
- Indicadores de modo no LCD: `f`, `g`, `RPN`/`ALG`, `STO`/`RCL` pendente
- Visualização de pilha (Y, Z, T) abaixo do valor principal de X
- Barra de status com registradores financeiros sempre visível

## Stack Técnico
- Expo Router (file-based)
- React Native 0.81 + React 19
- `@react-native-async-storage/async-storage` para persistência
- `expo-haptics` para feedback tátil
- TypeScript

## Arquitetura
- `/app/frontend/app/index.tsx`: UI da calculadora, gerenciamento de estado, dispatch de teclas, modais
- `/app/frontend/src/hp12c.ts`: motor de cálculo — pilha RPN, solvers TVM (Newton-Raphson para i), NPV/IRR, depreciação (SL/SOYD/DDB), amortização, juros simples

## Sem Integrações Externas
A calculadora opera 100% offline. Não há backend, autenticação, LLM ou APIs de terceiros.

## Status
✅ MVP completo e testado (14/14 fluxos críticos aprovados).
