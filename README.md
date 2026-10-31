# Break Point — Print Files & Mockup Organizer (Setup & My Store)

Este documento reúne a visão geral, regras de negócio consolidadas, arquitetura de software modular e instruções de geração do executável (`.exe`) do sistema **Break Point — Print Files & Mockup Organizer**.

---

## 1. Visão Geral do Projeto

O aplicativo foi desenvolvido para automatizar a organização, limpeza, renomeação e empacotamento de arquivos de impressão (**Final Files**) e imagens de visualização (**Mockups**) da **Break Point**, gerando pacotes `.zip` estruturados prontos para o Google Drive com 100% de integridade binária (**CRC32**).

O sistema possui dois módulos principais acessíveis diretamente ao lado do título **DESIGN FILE SETUP**:
1. **SETUP**: Organiza lotes de produção do zero a partir do ZIP de Mockups e do ZIP de Final Files (com todas as proteções de filtro, espelhamento Adult/Kids, Upload Parcial Inteligente e Memória Visual IA sempre ativos por padrão).
2. **MY STORE**: Atualiza pastas já prontas de clientes (removendo o `#Número Letra` antigo, aplicando o novo `#Número Letra`, mantendo os Final Files intactos e realizando a substituição inteligente dos mockups conforme o modo Cliente Novo ou Cliente Antigo).

---

## 2. Arquitetura Modular do Projeto

```text
BreakPointApp/
├── index.html            # Interface visual limpa (Setup, My Store e Modal de Preview)
├── main.js               # Processo principal do Electron (Janela 1440x900 com icon.ico)
├── package.json          # Configuração do Electron e Electron Builder (NSIS + Portable)
├── icon.ico / favicon.png
└── src/
    ├── css/
    │   └── styles.css    # Estilos tipográficos e barra de rolagem customizada
    └── js/
        ├── config.js     # VisualMemoryEngine e BreakPointConfig (pastas e cores)
        ├── utils.js      # BinaryUtils (CRC32) e VisualImageInspector (thumbnails/SVG)
        ├── classifier.js # ExclusionFilterEngine, RenamingEngine e CategoryClassifier
        ├── processors.js # ZipProcessor (Setup) e MyStoreEngine (My Store)
        └── app.js        # AppState e UIController (eventos, drag-and-drop e tabelas)
```

---

## 3. Regras de Negócio e Classificação Consolidada

### 3.1. Regra de Stickers (Multiplicação em 6 Tamanhos e Verificação de `"inches"`)
* **Pasta de Destino**: `Stickers`
* **Mockup de Sticker**: Mantém apenas **1 arquivo** renomeado com `#Número Letra` (não multiplica em 6 tamanhos).
* **Final File de Sticker**: Multiplica automaticamente em **6 versões** (`10 inches`, `8 inches`, `6 inches`, `4 inches`, `3 inches`, `2 inches`).
* **Verificação inteligente da palavra `"inches"`**:
  * **Caso `"inches"` JÁ esteja escrito no arquivo** (ex.: `Stickers - inches - Final File - 208 Jiu Jitsu.png` ou `Stickers - 2 inches - Final File - 208 Jiu Jitsu.png`): O sistema reconhece a palavra existente e apenas adiciona o número e um espaço na frente (`10 inches`, `8 inches`, etc.), gerando `#1922 C Stickers - 2 inches - Final File - 208 Jiu Jitsu.png` **sem nunca duplicar `- inches -`**.
  * **Caso `"inches"` NÃO esteja escrito no arquivo** (ex.: `Stickers - Final File - 208 Jiu Jitsu.png`): O sistema insere `<numero> inches` completo nas 6 versões.

### 3.2. Prioridade Blindada de Rashguards
A verificação de **Rashguards** executa **antes** de `Bottom Wear DTF` e `Topwear DTF`, analisando exclusivamente o nome da peça (impedindo que siglas como `SS` / *Short Sleeve* ou pastas do ZIP joguem Rashguards dentro da pasta de `Shorts`).
* **`All Black` e `All Black Ranked`**:
  * Arquivos como `All Black LS RashGuard Mockup`, `All Black SS RashGuard Mockup`, `All Black LS Ranked RashGuard Mockup` e `All Black Ranked RashGuards Mockup` vão para **`All Black/Rashguards/Adult`** e **`All Black/Rashguards/Kids`**.
  * `All Black Ranked Kids RashGuard Mockup` (com `Kids` explícito no nome) vai exclusivamente para **`All Black/Rashguards/Kids`**.
* **`No Gi` (`RashGuards Mockup` Branca e Cinza sem cor no nome)**:
  * O arquivo `RashGuards Mockup` (template retangular branco e cinza sem cor específica no nome), `RashGuards Mockup (Rectangle)` ou `Rashguard Adult/Kids Final Files` vai exclusivamente para **`No Gi/Rashguards/Adult`** e **`No Gi/Rashguards/Kids`**.
* **`Colored RashGuard`**:
  * Rashguards com cor explícita no nome da peça (ex.: `Gray RashGuard Mockup`, `Pink RashGuard Mockup`, `Back Light Colors RashGuards Adult Final File`) vão para **`Colored RashGuard/Adult`** e **`Colored RashGuard/Kids`**.

### 3.3. Topwear DTF: `Centered` vs. `Pocket` e `White DTF`
* **Modo `Centered`**:
  * Separa automaticamente as peças de **Zip Up** (`ZipUp`, `Varsity ZipUp`, `Sherpa ZipUp`) em uma pasta própria com a letra secundária (ex.: `Topwear DTF/#980 B/Black/Adult` e `Kids`), enquanto as demais peças ficam na letra principal (`#980 L`).
  * **Espelhamento de `Back`**: Se houver Zip Up no lote Centered, o arquivo `Back` da Topwear principal é copiado e renomeado automaticamente com a letra da Zip Up (exceto na cor `White`, pois Zip Up não possui pasta `White`).
* **Modo `Pocket`**:
  * Mantém todos os mockups de Zip Up junto com as demais peças na mesma letra principal (`#980 L`), compartilhando o mesmo Final File.
* **`White DTF`**:
  * Qualquer arquivo contendo `White DTF` ou `DTF White` (ex.: `Back white DTF Adult Final File`, `Front White DTF Kids Final File`) vai diretamente para **`Topwear DTF/#Número Letra/White/Adult`** ou **`Kids`**.
* **Peças `Cropped`**:
  * Qualquer peça `Cropped` (ex.: `Womens Black Cropped Shirt Mockup`, `Black Cropped Sweatshirt Mockup`) é alocada na subpasta **`Kids`** da respectiva cor.

### 3.4. Bottom Wear DTF: Shorts (`5.5"` / `4.5"`) e Sweatpants (`2.5 in` / `3 in`)
* **Shorts**:
  * `5.5 inches` → `Bottom Wear DTF/<Cor>/Shorts/Adult`
  * `4.5 inches` → `Bottom Wear DTF/<Cor>/Shorts/Kids`
  * **Restrição**: `Darker Colors` não possui subpasta `Shorts` (apenas `Black` e `Light Colors`).
* **Sweatpants / Sweat Shorts / Joggers**:
  * `Shadow Womens Sweatpants Mockup` e `Shadow Womens Sweat Short Mockup` → `Bottom Wear DTF/Darker Colors/Sweatpants - Sweat Shorts/2.5 in`.
  * `Sage Womens Sweat Short Mockup` e `Sage Womens Sweatpants Mockup` → `Bottom Wear DTF/Light Colors/Sweatpants - Sweat Shorts/2.5 in`.
  * `Gray Joggers 2.0 Mockup` → `Bottom Wear DTF/Darker Colors/Sweatpants - Sweat Shorts/3 in`.

### 3.5. Bags e Hats & Beanies
* **Bags**:
  * `4 Inches`: Crossbody Bag (`Black Crossbody Bag`, `GrayBronze Crossbody Bag`).
  * `6 Inches`: Hybrid Backpack / Small Duffel.
  * `8 Inches`: Travel Backpack.
  * `10 Inches`: Drawstring Bag / Giant Rolling Bag.
* **Hats and Beanies**:
  * Todos os bonés e gorros (`Perforated White Hat Side Mockup`, `Perforated Black Camo Hat Mockup`, Beanies) vão direto para a raiz de **`Hats and Beanies`**, sem subpastas de cor.

### 3.6. Filtro Automático de Limpeza (Thumbnails Multi-cor e Patches)
* Remove automaticamente **Gi Patches** e **Belt Patches**.
* Remove automaticamente **Mockup Thumbnails de vitrine** (como `Basketball Jersey Mockup.jpg` sem cor única no nome e nomes no plural como `Womens Cropped Shirts Mockup`, `Tank Tops Mockup`, `Hoodies Mockup`), mantendo intactos os mockups de peças individuais (`Black Basketball Jersey Mockup`, `Gold Basketball Jersey Mockup`, etc.).

---

## 4. Módulo MY STORE (Atualização de Pasta de Cliente)

Na aba **MY STORE**, o fluxo automatiza a atualização de lojas de clientes:
1. **Configuração**:
   * Campos limpos por padrão (usando apenas *placeholders*): **Prefixo Antigo (Opcional/Auto)**, **Novo Customer / Design #**, **Nova Design Letter**, seletor **Posição da Logo (`Centered` vs. `Pocket`)** e **Nova Zip Up Letter**.
2. **Dois Modos de Verificação de Mockups no ZIP**:
   * **Verificação Inteligente (Cliente Novo — Padrão)**: O sistema lê o ZIP de novos mockups, compara com os mockups existentes na pasta antiga do cliente e **deleta/substitui apenas os mockups que vieram no ZIP novo**. Os demais mockups que já seguem o modelo novo da My Store são mantidos e têm o seu `#Número Letra` atualizado automaticamente.
   * **Cliente Antigo (Deletar 100% dos Mockups Antigos)**: Remove todos os mockups antigos da pasta do cliente, mantém apenas os **Final Files** (atualizando o `#Número Letra` nos arquivos e nas pastas) e insere os mockups novos.

---

## 5. Comandos de Execução e Build (`.exe`)

* **Rodar em modo desenvolvimento:**
  ```bash
  npm start
  ```
* **Gerar instalador e versão portátil atualizados na pasta `instalador/`:**
  ```bash
  npm run dist
  ```
