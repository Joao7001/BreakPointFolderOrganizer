/**
 * Break Point — Shopify Inventory Report Module
 * Reconstrução 100% fiel à lógica do processor.py e app.py (ShopifyInventoryTool)
 */

const InventoryReportEngine = {
  // Ordem e cores usadas na legenda "Sales Rep Name / Color Marked".
  REP_COLORS: {
    Tony: "F4CCCC",
    Brandon: "FCE5CD",
    Gomes: "D9EAD3",
    George: "FF0000",
    Rinaldo: "9900FF",
    Victor: "00FFFF",
    Rossina: "FF9900"
  },

  get REP_NAMES() {
    return Object.keys(this.REP_COLORS);
  },

  // Cores da coluna "Registered in the APP Inv Sync"
  STATUS_COLORS: {
    YES: "D9EAD3",
    NO: "F4CCCC"
  },

  QTY_COLUMN: "Available (not editable)",
  QTY_THRESHOLD: 24,
  INVENTORY_SYNC_TAG: "inventory_sync",

  // Um produto é excluído se o Handle OU as Tags baterem com algum destes padrões.
  EXCLUDE_PATTERNS: [
    /test/i,
    /action[\s-]?order/i,
    /action[\s-]?sublimation/i,
    /(?:^|[^a-z0-9])s[0-2]\d+/i
  ],

  // Produtos específicos que devem sempre ser removidos, por Title exato
  // (sem diferenciar maiúsc./minúsc. nem espaços duplicados).
  EXCLUDE_TITLES: new Set([
    "new breed patch set",
    "kingsway jiu-jitsu hats and beanies - patch #999 b",
    "kingsway jiu-jitsu sewing set - 2 #999 a",
    "belt patch tom deblass #1000"
  ]),

  // Formato colado pela planilha de "produtos a caminho": "<Título> - <Variante>(<SKU>)"
  TRAILING_SKU_RE: /\(([^()]+)\)\s*$/,

  normalizeTitle(title) {
    return String(title ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  },

  /**
   * Parser RFC-4180 completo para arquivos CSV (suporta aspas, vírgulas internas e quebras de linha)
   */
  parseCsvText(text) {
    const cleanText = String(text ?? "").replace(/^\uFEFF/, "");
    const rows = [];
    let currentRow = [];
    let currentField = "";
    let inQuotes = false;

    for (let i = 0; i < cleanText.length; i++) {
      const ch = cleanText[i];
      const next = cleanText[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          currentField += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          currentField += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          currentRow.push(currentField);
          currentField = "";
        } else if (ch === "\r" && next === "\n") {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = "";
          i++;
        } else if (ch === "\n" || ch === "\r") {
          currentRow.push(currentField);
          rows.push(currentRow);
          currentRow = [];
          currentField = "";
        } else {
          currentField += ch;
        }
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField);
      rows.push(currentRow);
    }

    if (rows.length === 0) {
      return { columns: [], rows: [] };
    }

    const columns = rows[0].map((c) => String(c ?? ""));
    const dataRows = [];

    for (let r = 1; r < rows.length; r++) {
      const rawRow = rows[r];
      // Ignora linha final completamente vazia causada por quebra de linha no fim do arquivo
      if (rawRow.length === 1 && rawRow[0] === "" && columns.length > 1) continue;
      const obj = {};
      for (let c = 0; c < columns.length; c++) {
        obj[columns[c]] = rawRow[c] !== undefined ? String(rawRow[c]) : "";
      }
      dataRows.push(obj);
    }

    return { columns, rows: dataRows };
  },

  /**
   * Fallback nativo via JSZip para leitura de arquivos .xlsx mesmo sem conexão CDN
   */
  async parseXlsxWithJsZip(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const sharedStrings = [];

    const sstFile = zip.file("xl/sharedStrings.xml");
    if (sstFile) {
      const sstXml = await sstFile.async("string");
      const parser = new DOMParser();
      const doc = parser.parseFromString(sstXml, "application/xml");
      const siNodes = doc.getElementsByTagName("si");
      for (let i = 0; i < siNodes.length; i++) {
        const tNodes = siNodes[i].getElementsByTagName("t");
        let val = "";
        for (let j = 0; j < tNodes.length; j++) {
          val += tNodes[j].textContent || "";
        }
        sharedStrings.push(val);
      }
    }

    const sheetFile =
      zip.file("xl/worksheets/sheet1.xml") ||
      Object.values(zip.files).find((f) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(f.name));

    if (!sheetFile) {
      throw new Error("Não foi possível localizar a planilha dentro do arquivo .xlsx.");
    }

    const sheetXml = await sheetFile.async("string");
    const parser = new DOMParser();
    const doc = parser.parseFromString(sheetXml, "application/xml");
    const rowNodes = doc.getElementsByTagName("row");

    const colRefToIndex = (ref) => {
      const match = /^([A-Z]+)/i.exec(ref || "");
      if (!match) return 0;
      const letters = match[1].toUpperCase();
      let idx = 0;
      for (let i = 0; i < letters.length; i++) {
        idx = idx * 26 + (letters.charCodeAt(i) - 64);
      }
      return idx - 1;
    };

    const matrix = [];
    let maxCol = 0;

    for (let r = 0; r < rowNodes.length; r++) {
      const cNodes = rowNodes[r].getElementsByTagName("c");
      const rowArr = [];
      for (let c = 0; c < cNodes.length; c++) {
        const cell = cNodes[c];
        const ref = cell.getAttribute("r") || "";
        const colIdx = ref ? colRefToIndex(ref) : c;
        if (colIdx + 1 > maxCol) maxCol = colIdx + 1;

        const type = cell.getAttribute("t");
        let val = "";
        if (type === "s") {
          const vNode = cell.getElementsByTagName("v")[0];
          const sstIdx = vNode ? parseInt(vNode.textContent, 10) : -1;
          val = sstIdx >= 0 && sstIdx < sharedStrings.length ? sharedStrings[sstIdx] : "";
        } else if (type === "inlineStr") {
          const tNodes = cell.getElementsByTagName("t");
          for (let j = 0; j < tNodes.length; j++) {
            val += tNodes[j].textContent || "";
          }
        } else {
          const vNode = cell.getElementsByTagName("v")[0];
          val = vNode && vNode.textContent !== null ? vNode.textContent : "";
        }
        rowArr[colIdx] = String(val ?? "");
      }
      matrix.push(rowArr);
    }

    if (matrix.length === 0) return { columns: [], rows: [] };

    const columns = [];
    for (let c = 0; c < maxCol; c++) {
      columns.push(matrix[0][c] !== undefined ? String(matrix[0][c]) : `Unnamed: ${c}`);
    }

    const dataRows = [];
    for (let r = 1; r < matrix.length; r++) {
      const obj = {};
      for (let c = 0; c < columns.length; c++) {
        obj[columns[c]] = matrix[r][c] !== undefined ? String(matrix[r][c]) : "";
      }
      dataRows.push(obj);
    }

    return { columns, rows: dataRows };
  },

  /**
   * Lê qualquer arquivo (.csv, .xlsx, .xls) convertendo valores para string e preenchendo vazios com ""
   * Equivalente a _read_any(path) do processor.py
   */
  async readAnyFile(file) {
    const name = (file?.name || "").toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      if (typeof window.XLSX !== "undefined") {
        const wb = window.XLSX.read(buffer, { type: "array", raw: false });
        const firstSheetName = wb.SheetNames[0];
        const ws = wb.Sheets[firstSheetName];
        const matrix = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
        if (!matrix || matrix.length === 0) return { columns: [], rows: [] };
        const columns = matrix[0].map((c) => String(c ?? ""));
        const rows = [];
        for (let i = 1; i < matrix.length; i++) {
          const rowArr = matrix[i];
          const obj = {};
          for (let c = 0; c < columns.length; c++) {
            obj[columns[c]] = rowArr[c] !== undefined && rowArr[c] !== null ? String(rowArr[c]) : "";
          }
          rows.push(obj);
        }
        return { columns, rows };
      }
      return await this.parseXlsxWithJsZip(buffer);
    } else {
      const text = await file.text();
      return this.parseCsvText(text);
    }
  },

  loadInventoryData(parsed) {
    const required = ["Handle", "Title", "SKU", this.QTY_COLUMN];
    const missing = required.filter((c) => !parsed.columns.includes(c));
    if (missing.length > 0) {
      throw new Error(
        `Faltam colunas no relatório de estoque: [${missing.map((c) => `'${c}'`).join(", ")}].\n` +
          `Colunas encontradas: [${parsed.columns.map((c) => `'${c}'`).join(", ")}]`
      );
    }
    return parsed.rows;
  },

  loadTagsData(parsed) {
    const required = ["Handle", "Tags"];
    const missing = required.filter((c) => !parsed.columns.includes(c));
    if (missing.length > 0) {
      throw new Error(
        `Faltam colunas no relatório de produtos/tags: [${missing.map((c) => `'${c}'`).join(", ")}].\n` +
          `Colunas encontradas: [${parsed.columns.map((c) => `'${c}'`).join(", ")}]`
      );
    }
    const tagsByHandle = new Map();
    for (const row of parsed.rows) {
      const tags = String(row["Tags"] ?? "");
      if (tags.trim() === "") continue;
      const handle = String(row["Handle"] ?? "");
      if (!tagsByHandle.has(handle)) {
        tagsByHandle.set(handle, tags);
      }
    }
    return tagsByHandle;
  },

  matchesExclusion(handle, title, tags) {
    if (this.EXCLUDE_TITLES.has(this.normalizeTitle(title))) {
      return true;
    }
    const haystack = `${handle} ${tags}`;
    return this.EXCLUDE_PATTERNS.some((pattern) => pattern.test(haystack));
  },

  parseIncomingList(rawText) {
    const skus = new Set();
    const titles = new Set();
    for (const rawLine of String(rawText || "").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = this.TRAILING_SKU_RE.exec(line);
      if (match) {
        skus.add(match[1].trim().toLowerCase());
      } else {
        titles.add(this.normalizeTitle(line));
      }
    }
    return { skus, titles };
  },

  matchesIncoming(sku, title, incomingSkus, incomingTitles) {
    if (sku && String(sku).trim().length > 0 && incomingSkus.has(String(sku).trim().toLowerCase())) {
      return true;
    }
    if (incomingTitles.size > 0 && incomingTitles.has(this.normalizeTitle(title))) {
      return true;
    }
    return false;
  },

  detectRep(tags) {
    const lowered = String(tags || "").toLowerCase();
    for (const rep of this.REP_NAMES) {
      if (lowered.includes(rep.toLowerCase())) {
        return rep;
      }
    }
    return null;
  },

  isRegistered(tags) {
    const tagList = String(tags || "")
      .split(",")
      .map((t) => t.trim().toLowerCase());
    return tagList.includes(this.INVENTORY_SYNC_TAG) ? "YES" : "NO";
  },

  toNumeric(val) {
    const str = String(val ?? "").trim();
    if (str === "") return NaN;
    const num = Number(str);
    return Number.isFinite(num) ? num : NaN;
  },

  /**
   * Executa o processamento idêntico à função process() do processor.py
   */
  async processFiles(inventoryFile, tagsFile, qtyThreshold = this.QTY_THRESHOLD, incomingText = "") {
    const [invParsed, tagsParsed] = await Promise.all([
      this.readAnyFile(inventoryFile),
      this.readAnyFile(tagsFile)
    ]);

    return this.processParsedData(invParsed, tagsParsed, qtyThreshold, incomingText);
  },

  processParsedData(invParsed, tagsParsed, qtyThreshold = this.QTY_THRESHOLD, incomingText = "") {
    const invRows = this.loadInventoryData(invParsed);
    const tagsByHandle = this.loadTagsData(tagsParsed);
    const { skus: incomingSkus, titles: incomingTitles } = this.parseIncomingList(incomingText);

    const filtered = [];
    let excludedByRuleCount = 0;
    let excludedByIncomingCount = 0;
    let excludedByQtyCount = 0;

    for (let i = 0; i < invRows.length; i++) {
      const r = invRows[i];
      const handle = String(r["Handle"] ?? "");
      const title = String(r["Title"] ?? "");
      const sku = String(r["SKU"] ?? "");
      const tags = tagsByHandle.has(handle) ? tagsByHandle.get(handle) : "";
      const qtyNum = this.toNumeric(r[this.QTY_COLUMN]);

      const isRuleExcluded = this.matchesExclusion(handle, title, tags);
      const isIncomingExcluded = !isRuleExcluded && this.matchesIncoming(sku, title, incomingSkus, incomingTitles);

      if (isRuleExcluded) {
        excludedByRuleCount++;
        continue;
      }
      if (isIncomingExcluded) {
        excludedByIncomingCount++;
        continue;
      }

      if (!Number.isFinite(qtyNum) || qtyNum > qtyThreshold) {
        excludedByQtyCount++;
        continue;
      }

      const variantQty = Math.trunc(qtyNum);
      const registered = this.isRegistered(tags);
      const salesRep = this.detectRep(tags);

      filtered.push({
        Title: title,
        Tags: tags,
        "Variant Inventory Qty": variantQty,
        "Registered in the APP Inv Sync": registered,
        "Sales Rep": salesRep,
        _origIndex: i
      });
    }

    // Ordenação estável decrescente por "Variant Inventory Qty" (kind="stable", ascending=False)
    filtered.sort((a, b) => {
      if (b["Variant Inventory Qty"] !== a["Variant Inventory Qty"]) {
        return b["Variant Inventory Qty"] - a["Variant Inventory Qty"];
      }
      return a._origIndex - b._origIndex;
    });

    const rows = filtered.map((item) => ({
      Title: item.Title,
      Tags: item.Tags,
      "Variant Inventory Qty": item["Variant Inventory Qty"],
      "Registered in the APP Inv Sync": item["Registered in the APP Inv Sync"],
      "Sales Rep": item["Sales Rep"]
    }));

    return {
      rows,
      stats: {
        totalInputRows: invRows.length,
        finalCount: rows.length,
        excludedByRuleCount,
        excludedByIncomingCount,
        excludedByQtyCount,
        syncYesCount: rows.filter((r) => r["Registered in the APP Inv Sync"] === "YES").length,
        syncNoCount: rows.filter((r) => r["Registered in the APP Inv Sync"] === "NO").length
      }
    };
  },

  escapeXml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
      // Remove caracteres de controle XML inválidos (exceto tab, CR, LF)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  },

  /**
   * Gera o arquivo .xlsx com Conditional Formatting ("Text contains"):
   * - Aba "Inventory Report"
   * - Cabeçalhos Arial 12 Bold com bordas finas pretas em A1:D1 e F1:G1
   * - Dados Arial 10 com bordas finas pretas em A2:D{N} (sem pintura estática nas células de dados)
   * - Regras de Formatação Condicional ("Text contains") na coluna B (Tags -> por Sales Rep)
   *   e na coluna D (Registered in the APP Inv Sync -> YES / NO)
   * - Legenda Sales Rep Name / Color Marked em F2:G8
   * - AutoFilter em A1:D{N} e larguras de coluna {A:55, B:60, C:16, D:22, F:16, G:14}
   */
  async buildWorkbookBlob(rows) {
    const zip = new JSZip();

    // Coleta as cores da legenda (coluna G) para fills estáticos apenas no quadradinho da legenda
    const uniqueColors = [];
    const addColor = (hex) => {
      const clean = hex.toUpperCase();
      if (!uniqueColors.includes(clean)) uniqueColors.push(clean);
    };

    Object.values(this.REP_COLORS).forEach(addColor);

    // Fill 0 = none, Fill 1 = gray125 (obrigatórios na especificação OpenXML), Fill 2+ = cores da legenda
    const colorToFillId = {};
    uniqueColors.forEach((hex, idx) => {
      colorToFillId[hex] = idx + 2;
    });

    // CellXfs:
    // 0 = Default
    // 1 = Header (Arial 12 Bold + thin border)
    // 2 = Data sem cor estática (Arial 10 + thin border) -> usado em TODAS as células A, B, C, D e F
    // 3+ = Swatch da legenda na coluna G (Color Marked)
    const colorToStyleId = {};
    uniqueColors.forEach((hex, idx) => {
      colorToStyleId[hex] = idx + 3;
    });

    const fillsXml = [
      `<fill><patternFill patternType="none"/></fill>`,
      `<fill><patternFill patternType="gray125"/></fill>`,
      ...uniqueColors.map(
        (hex) =>
          `<fill><patternFill patternType="solid"><fgColor rgb="FF${hex}"/><bgColor indexed="64"/></patternFill></fill>`
      )
    ].join("");

    const cellXfsXml = [
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
      `<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>`,
      `<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>`,
      ...uniqueColors.map(
        (hex) =>
          `<xf numFmtId="0" fontId="2" fillId="${colorToFillId[hex]}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>`
      )
    ].join("");

    // DXFs (Differential Formatting) para as regras de Conditional Formatting (Text contains)
    const dxfRules = [];
    const repNames = this.REP_NAMES;

    // 1) DXFs para cada Sales Rep na ordem de prioridade
    repNames.forEach((rep) => {
      dxfRules.push({
        type: "rep",
        text: rep,
        hex: this.REP_COLORS[rep].toUpperCase()
      });
    });

    // 2) DXFs para YES e NO na coluna D
    dxfRules.push({
      type: "status",
      text: "YES",
      hex: this.STATUS_COLORS.YES.toUpperCase()
    });
    dxfRules.push({
      type: "status",
      text: "NO",
      hex: this.STATUS_COLORS.NO.toUpperCase()
    });

    const dxfsXml = dxfRules
      .map(
        (rule) =>
          `<dxf><fill><patternFill patternType="solid"><fgColor rgb="FF${rule.hex}"/><bgColor rgb="FF${rule.hex}"/></patternFill></fill></dxf>`
      )
      .join("");

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="12"/><name val="Arial"/></font>
    <font><sz val="10"/><name val="Arial"/></font>
  </fonts>
  <fills count="${uniqueColors.length + 2}">
    ${fillsXml}
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FF000000"/></left>
      <right style="thin"><color rgb="FF000000"/></right>
      <top style="thin"><color rgb="FF000000"/></top>
      <bottom style="thin"><color rgb="FF000000"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="${uniqueColors.length + 3}">
    ${cellXfsXml}
  </cellXfs>
  <dxfs count="${dxfRules.length}">
    ${dxfsXml}
  </dxfs>
</styleSheet>`;

    const inlineStrCell = (ref, text, styleId) => {
      const str = String(text ?? "");
      const preserve = /^\s|\s$|\s{2,}|\n/.test(str) ? ` xml:space="preserve"` : "";
      return `<c r="${ref}" s="${styleId}" t="inlineStr"><is><t${preserve}>${this.escapeXml(str)}</t></is></c>`;
    };

    const numCell = (ref, num, styleId) => {
      return `<c r="${ref}" s="${styleId}"><v>${Number(num)}</v></c>`;
    };

    const emptyStyledCell = (ref, styleId) => {
      return `<c r="${ref}" s="${styleId}"/>`;
    };

    const sheetRowsXml = [];

    // Linha 1: Cabeçalhos
    const row1Cells = [
      inlineStrCell("A1", "Title", 1),
      inlineStrCell("B1", "Tags", 1),
      inlineStrCell("C1", "Variant Inventory Qty", 1),
      inlineStrCell("D1", "Registered in the APP Inv Sync", 1),
      inlineStrCell("F1", "Sales Rep Name", 1),
      inlineStrCell("G1", "Color Marked", 1)
    ];
    sheetRowsXml.push(`<row r="1">${row1Cells.join("")}</row>`);

    const totalRows = Math.max(rows.length + 1, repNames.length + 1);

    for (let rIdx = 2; rIdx <= totalRows; rIdx++) {
      const cells = [];
      const dataIdx = rIdx - 2;
      const repIdx = rIdx - 2;

      if (dataIdx < rows.length) {
        const row = rows[dataIdx];
        const status = row["Registered in the APP Inv Sync"];

        // Todas as células de dados (A, B, C, D) usam estilo 2 (sem cor fixa),
        // pois a cor é aplicada via Conditional Formatting ("Text contains")
        cells.push(inlineStrCell(`A${rIdx}`, row["Title"], 2));
        cells.push(inlineStrCell(`B${rIdx}`, row["Tags"], 2));
        cells.push(numCell(`C${rIdx}`, row["Variant Inventory Qty"], 2));
        cells.push(inlineStrCell(`D${rIdx}`, status, 2));
      }

      if (repIdx < repNames.length) {
        const repName = repNames[repIdx];
        const repColorHex = this.REP_COLORS[repName];
        const repFillStyle = colorToStyleId[repColorHex];

        cells.push(inlineStrCell(`F${rIdx}`, repName, 2));
        cells.push(emptyStyledCell(`G${rIdx}`, repFillStyle));
      }

      sheetRowsXml.push(`<row r="${rIdx}">${cells.join("")}</row>`);
    }

    const lastDataRow = Math.max(rows.length + 1, 2);
    const autoFilterXml = rows.length > 0 ? `<autoFilter ref="A1:D${rows.length + 1}"/>` : "";

    // Regras de Conditional Formatting ("Text contains") para a Coluna B (Tags -> Representantes)
    const repCfRulesXml = repNames
      .map((rep, idx) => {
        const priority = idx + 1;
        return `<cfRule type="containsText" dxfId="${idx}" priority="${priority}" operator="containsText" text="${this.escapeXml(rep)}"><formula>NOT(ISERROR(SEARCH("${this.escapeXml(rep)}",B2)))</formula></cfRule>`;
      })
      .join("\n    ");

    // Regras de Conditional Formatting ("Text contains") para a Coluna D (YES / NO)
    const yesDxfId = repNames.length;
    const noDxfId = repNames.length + 1;
    const statusCfRulesXml = [
      `<cfRule type="containsText" dxfId="${yesDxfId}" priority="${repNames.length + 1}" operator="containsText" text="YES"><formula>NOT(ISERROR(SEARCH("YES",D2)))</formula></cfRule>`,
      `<cfRule type="containsText" dxfId="${noDxfId}" priority="${repNames.length + 2}" operator="containsText" text="NO"><formula>NOT(ISERROR(SEARCH("NO",D2)))</formula></cfRule>`
    ].join("\n    ");

    const conditionalFormattingXml = `
  <conditionalFormatting sqref="B2:B${lastDataRow}">
    ${repCfRulesXml}
  </conditionalFormatting>
  <conditionalFormatting sqref="D2:D${lastDataRow}">
    ${statusCfRulesXml}
  </conditionalFormatting>`;

    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>
    <col min="1" max="1" width="55" customWidth="1"/>
    <col min="2" max="2" width="60" customWidth="1"/>
    <col min="3" max="3" width="16" customWidth="1"/>
    <col min="4" max="4" width="22" customWidth="1"/>
    <col min="6" max="6" width="16" customWidth="1"/>
    <col min="7" max="7" width="14" customWidth="1"/>
  </cols>
  <sheetData>
    ${sheetRowsXml.join("\n    ")}
  </sheetData>
  ${autoFilterXml}${conditionalFormattingXml}
</worksheet>`;

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Inventory Report" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

    const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

    const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

    zip.file("[Content_Types].xml", contentTypesXml);
    zip.file("_rels/.rels", rootRelsXml);
    zip.file("xl/workbook.xml", workbookXml);
    zip.file("xl/_rels/workbook.xml.rels", workbookRelsXml);
    zip.file("xl/styles.xml", stylesXml);
    zip.file("xl/worksheets/sheet1.xml", sheetXml);

    return await zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      compression: "DEFLATE"
    });
  }
};

window.InventoryReportEngine = InventoryReportEngine;
