# Break Point — Internal Operations Suite

[![Baixar Instalador Windows (Setup .exe)](https://img.shields.io/badge/%E2%AC%87%EF%B8%8F_DOWNLOAD_WINDOWS-Setup_1.0.3.exe-1b7a4e?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/Joao7001/BreakPointFolderOrganizer/releases/latest/download/Break-Point-Folder-Organizer-Setup-1.0.3.exe)
[![GitHub Releases](https://img.shields.io/badge/Releases-v1.0.3-17181c?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Joao7001/BreakPointFolderOrganizer/releases/latest)
[![Plataforma](https://img.shields.io/badge/Plataforma-Windows_10_%2F_11_(x64)-d49b27?style=for-the-badge)](https://github.com/Joao7001/BreakPointFolderOrganizer/releases/latest)

Aplicação desktop interna da **Break Point** desenvolvida para unificar e automatizar rotinas operacionais de produção, padronização de pacotes de arquivos e geração de relatórios de estoque em uma única interface.

---

## Visão Geral dos Módulos

A barra de navegação superior permite alternar instantaneamente entre as duas frentes operacionais da suíte:

### 1. 📁 Organizador de Pastas (`Setup Portal`)
Ambiente dedicado à preparação, classificação e empacotamento de arquivos de produção e visualização:
* **Fluxo `Setup`**: Importação unificada de pacotes `.zip`, classificação automática por linha de produto, validação visual interativa e exportação estruturada com verificação de integridade binária (`CRC32`).
* **Monitoramento de Empacotamento em Tempo Real**: Barra de progresso integrada com estimativa dinâmica de tempo restante (`ETA`) durante a compressão dos pacotes.
* **Fluxo `My Store`**: Atualização automatizada de pacotes existentes, renomeação inteligente de lotes e substituição seletiva de ativos visuais mantendo os arquivos base preservados.
* **Inspeção e Memória Visual**: Pré-visualização ampliada de itens com aprendizado local de preferências de organização.

### 2. 📊 Relatório de Estoque (`Inventory Portal`)
Ferramenta de cruzamento e consolidação de exportações da plataforma de e-commerce:
* **Importação Flexível**: Suporte direto a arquivos `.csv`, `.xlsx` e `.xls` (via seleção individual ou importação rápida dupla com detecção automática de colunas).
* **Filtragem Parametrizada**: Controle dinâmico de limite máximo de estoque disponível, remoção opcional de itens em trânsito e aplicação automática de filtros operacionais.
* **Exportação `.xlsx` com Formatação Condicional Nativa**: Geração direta de planilhas Excel estruturadas com regras dinâmicas de *Conditional Formatting* (`Text contains`), filtros automáticos (*AutoFilter*) e pré-visualização interativa na própria tela.

---

## Novidades da Versão `1.0.3`

* **Barra de Carregamento do ZIP (`ETA`)**: Nova barra de progresso em tempo real ao lado do botão de confirmação mostrando o carregamento e quanto tempo falta para o pacote `.zip` ficar pronto para download.
* **Novo Modal de Atualização Break Point**: Janela de atualização automática redesenhada para seguir a mesma identidade visual do aplicativo, com progresso de download integrado.
* **Refinamentos de Interface e Navegação**: Rolagem suave automática para a área de download assim que o relatório fica pronto e melhorias visuais nos painéis.

---

## Instalação e Atualizações Automáticas (Como Atualizar da V1)

[![Assistir Vídeo Tutorial MP4](https://img.shields.io/badge/%F0%9F%8E%AC_ASSISTIR_V%C3%8DDEO_TUTORIAL-Full_HD_(.MP4)-f3be4f?style=for-the-badge&labelColor=17181c)](https://github.com/Joao7001/BreakPointFolderOrganizer/releases/download/v1.0.1/Tutorial-Atualizacao-BreakPoint-V1-para-Nova-Versao.mp4)

> **⚠️ Importante para quem tem a V1 antiga:**
> Quem ainda está usando a primeira versão (V1) precisa fazer este passo a passo rápido **apenas 1 única vez**. A partir da nova versão instalada pelo arquivo `Setup`, o programa passa a **atualizar 100% sozinho** sempre que sair novidade!

![Tutorial de Atualização Break Point App](https://github.com/Joao7001/BreakPointFolderOrganizer/releases/download/v1.0.1/Tutorial-Atualizacao-BreakPoint.gif)

### Passo a Passo para Quem Tem a V1:

1. **1️⃣ Desinstalar a V1 Antiga no Windows**:
   * No menu Iniciar do Windows, digite **`Aplicativos instalados`** (ou *Adicionar ou remover programas*).
   * Procure por **`Break Point Folder Organizer`**, clique nos **3 pontinhos (`⋯`)** ao lado do nome e clique em **`Desinstalar`**.
   * *(💡 **Dica**: Se a sua V1 era a versão portátil em pasta solta, basta apagar o arquivo/pasta antigo da V1 e excluir o atalho antigo da sua Área de Trabalho para não confundir com o novo).*
2. **2️⃣ Baixar o Instalador Oficial no GitHub**:
   * Clique no botão verde **DOWNLOAD WINDOWS** no topo desta página ou baixe diretamente o arquivo com **`Setup`** no nome:
     👉 **[`Break-Point-Folder-Organizer-Setup-1.0.3.exe`](https://github.com/Joao7001/BreakPointFolderOrganizer/releases/latest/download/Break-Point-Folder-Organizer-Setup-1.0.3.exe)**
3. **3️⃣ Instalar no Computador (e passar pela tela azul do Windows)**:
   * Abra o arquivo `Break-Point-Folder-Organizer-Setup-1.0.3.exe` baixado.
   * Caso o Windows SmartScreen exiba a tela azul (*"O Windows protegeu o computador"*), clique em **`Mais informações`** → **`Executar assim mesmo`**.
   * Conclua o assistente de instalação clicando em **Avançar / Instalar** e **Concluir**.
4. **4️⃣ Pronto! Atualização Automática Ativa (`AutoUpdater`)**:
   * A partir de agora, o aplicativo verifica automaticamente novas releases publicadas ao ser iniciado e oferece o download e instalação com um único clique na tela, sem necessidade de desinstalar versões anteriores.

---

## Estrutura do Projeto

```text
BreakPointApp/
├── index.html                 # Interface principal unificada (Setup, My Store & Inventory Report)
├── main.js                    # Processo principal do Electron e gerenciador de AutoUpdate
├── package.json               # Configurações de build, empacotamento NSIS e publicação
└── src/
    ├── css/
    │   └── styles.css         # Identidade visual e estilização customizada
    └── js/
        ├── config.js          # Configurações estruturais e memória local
        ├── utils.js           # Utilitários binários (CRC32) e inspeção gráfica
        ├── classifier.js      # Motor de classificação e padronização de nomenclatura
        ├── processors.js      # Processamento de pacotes ZIP e atualização de diretórios
        ├── inventoryReport.js # Motor de consolidação de relatórios e geração OpenXML (.xlsx)
        └── app.js             # Controlador de estado e eventos da interface
```

---

## Comandos para Desenvolvimento e Build

* **Requisitos**: [Node.js](https://nodejs.org/) (v18+)
* **Instalar dependências**:
  ```bash
  npm install
  ```
* **Executar em modo de desenvolvimento**:
  ```bash
  npm start
  ```
* **Gerar instalador local (`instalador/`)**:
  ```bash
  npm run dist
  ```
* **Compilar e publicar nova Release**:
  ```bash
  npm run publish
  ```

---

© **Break Point** — Uso exclusivo interno.
