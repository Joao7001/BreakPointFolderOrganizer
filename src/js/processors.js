/**
 * Break Point — Processador de ZIPs (Modo SETUP e Modo MY STORE)
 */

const ZipProcessor = {
  cancelRequested: false,

  async extractZipEntries(fileObj, sourceRole, enableVisualAI, onProgress) {
    const arrayBuffer = await fileObj.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = [];
    const fileKeys = Object.keys(zip.files).filter((k) => {
      const entry = zip.files[k];
      if (entry.dir) return false;
      const base = k.split("/").pop();
      return !(base.startsWith("._") || base === ".DS_Store" || k.includes("__MACOSX/"));
    });

    for (let i = 0; i < fileKeys.length; i++) {
      if (this.cancelRequested) throw new Error("Operação cancelada.");
      const relativePath = fileKeys[i];
      const bytes = await zip.files[relativePath].async("uint8array");
      const crc = BinaryUtils.crc32(bytes);
      const originalName = relativePath.split("/").pop();
      const effectiveRole = /\bfinal\s*files?\b/i.test(originalName)
        ? "Final File"
        : (/\bmockups?\b/i.test(originalName) ? "Mockup" : sourceRole);

      const visualInfo = enableVisualAI
        ? await VisualImageInspector.inspectImageBytes(bytes, originalName, effectiveRole)
        : { isImage: false, thumbUrl: VisualImageInspector.createFallbackPreviewDataUrl(originalName, effectiveRole) };

      entries.push({
        originalName,
        relativePath,
        sourceRole: effectiveRole,
        bytes,
        sizeBytes: bytes.byteLength,
        crc32: crc,
        visualInfo
      });

      if (onProgress) onProgress(Math.round(((i + 1) / fileKeys.length) * 100), `Analisando ${originalName}...`);
      if (i % 8 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return entries;
  },

  buildProcessingQueue(rawEntries, config) {
    const queue = [];
    const seenStickerKeys = new Set();
    const pathCollisionMap = new Map();
    let nextId = 1;

    for (const raw of rawEntries) {
      const classification = CategoryClassifier.classifyFile(raw.originalName, raw.relativePath, config, raw.sourceRole, raw.visualInfo);
      const itemRole = classification.effectiveRole || raw.sourceRole;

      if (classification.autoExcluded) {
        queue.push({
          id: `item_${nextId++}`,
          sourceRole: itemRole,
          originalName: raw.originalName,
          relativePath: raw.relativePath,
          finalName: raw.originalName.split("/").pop(),
          category: classification.category,
          targetFolder: "Excluído Automaticamente",
          isSticker: false,
          isStickerMockup: false,
          isZipUp: false,
          needsReview: false,
          autoExcluded: true,
          excludeReason: classification.excludeReason,
          warnings: [],
          bytes: raw.bytes,
          sizeBytes: raw.sizeBytes,
          crc32: raw.crc32,
          visualInfo: raw.visualInfo,
          included: false
        });
        continue;
      }

      const activeLetter = (config.topwearType === "Centered" && classification.isZipUp)
        ? (config.zipUpLetter || "B").toUpperCase()
        : config.designLetter.toUpperCase();

      if (classification.isSticker) {
        if (classification.isStickerMockup) {
          const renameRes = RenamingEngine.renameStandardFile(raw.originalName, config.designNumber, config.designLetter.toUpperCase());
          const dedupKey = `stickers/${renameRes.finalName}`.toLowerCase();
          if (seenStickerKeys.has(dedupKey)) continue;
          seenStickerKeys.add(dedupKey);
          queue.push({
            id: `item_${nextId++}`,
            sourceRole: "Mockup",
            originalName: raw.originalName,
            relativePath: raw.relativePath,
            finalName: renameRes.finalName,
            category: "Stickers",
            targetFolder: "Stickers",
            isSticker: true,
            isStickerMockup: true,
            isZipUp: false,
            needsReview: false,
            autoExcluded: false,
            warnings: [],
            bytes: raw.bytes,
            sizeBytes: raw.sizeBytes,
            crc32: raw.crc32,
            visualInfo: raw.visualInfo,
            included: true
          });
          continue;
        }

        const stickerExpansion = RenamingEngine.expandStickerVersions(raw.originalName, config.designNumber, config.designLetter.toUpperCase(), config.defaultAcademy);
        for (const ver of stickerExpansion.versions) {
          const dedupKey = `${classification.targetFolder}/${ver.finalName}`.toLowerCase();
          if (seenStickerKeys.has(dedupKey)) continue;
          seenStickerKeys.add(dedupKey);
          queue.push({
            id: `item_${nextId++}`,
            sourceRole: "Final File",
            originalName: raw.originalName,
            relativePath: raw.relativePath,
            finalName: ver.finalName,
            category: "Stickers",
            targetFolder: "Stickers",
            isSticker: true,
            isStickerMockup: false,
            isZipUp: false,
            needsReview: ver.needsAcademyReview,
            autoExcluded: false,
            warnings: ver.needsAcademyReview ? ["Nome da academia não identificado."] : [],
            bytes: raw.bytes,
            sizeBytes: raw.sizeBytes,
            crc32: raw.crc32,
            visualInfo: raw.visualInfo,
            included: true
          });
        }
        continue;
      }

      const renameRes = RenamingEngine.renameStandardFile(raw.originalName, config.designNumber, activeLetter);
      const targetFoldersList = classification.sharedAdultKidsFolders && classification.sharedAdultKidsFolders.length > 0
        ? classification.sharedAdultKidsFolders
        : [classification.targetFolder];

      for (const folderDest of targetFoldersList) {
        const itemWarnings = [...classification.warnings];
        let itemNeedsReview = classification.needsReview;
        let currentFolder = folderDest;
        let finalName = renameRes.finalName;
        let isZipUpItem = classification.isZipUp;
        const fullTargetKey = `${currentFolder}/${finalName}`.toLowerCase();

        if (pathCollisionMap.has(fullTargetKey)) {
          const existingItem = pathCollisionMap.get(fullTargetKey);
          if (existingItem.crc32 === raw.crc32) continue;
          const cleanDesignNum = String(config.designNumber).trim().replace(/^#+/, "");
          const mainPrefix = `#${cleanDesignNum} ${config.designLetter.toUpperCase()}`;
          const zipPrefix = `#${cleanDesignNum} ${(config.zipUpLetter || "B").toUpperCase()}`;

          if (config.topwearType === "Centered" && currentFolder.startsWith(`Topwear DTF/${mainPrefix}/`) && !currentFolder.includes("/White/")) {
            const zipFolder = currentFolder.replace(`Topwear DTF/${mainPrefix}/`, `Topwear DTF/${zipPrefix}/`);
            const zipName = RenamingEngine.renameStandardFile(raw.originalName, config.designNumber, (config.zipUpLetter || "B").toUpperCase()).finalName;
            const existingRatio = existingItem.visualInfo?.nonTransparentRatio ?? existingItem.sizeBytes;
            const currentRatio = raw.visualInfo?.nonTransparentRatio ?? raw.sizeBytes;

            if (currentRatio <= existingRatio) {
              currentFolder = zipFolder;
              finalName = zipName;
              isZipUpItem = true;
            } else {
              existingItem.targetFolder = zipFolder;
              existingItem.finalName = RenamingEngine.renameStandardFile(existingItem.originalName, config.designNumber, (config.zipUpLetter || "B").toUpperCase()).finalName;
              existingItem.category = "Topwear DTF (Zip Up)";
              existingItem.isZipUp = true;
              pathCollisionMap.set(`${existingItem.targetFolder}/${existingItem.finalName}`.toLowerCase(), existingItem);
            }
          } else {
            itemNeedsReview = true;
            itemWarnings.push(`Conflito de nome na pasta "${currentFolder}".`);
          }
        }

        const newItem = {
          id: `item_${nextId++}`,
          sourceRole: itemRole,
          originalName: raw.originalName,
          relativePath: raw.relativePath,
          finalName,
          category: isZipUpItem ? "Topwear DTF (Zip Up)" : classification.category,
          targetFolder: currentFolder,
          isSticker: false,
          isStickerMockup: false,
          isZipUp: isZipUpItem,
          needsReview: itemNeedsReview,
          reviewType: classification.reviewType,
          autoExcluded: false,
          warnings: itemWarnings,
          bytes: raw.bytes,
          sizeBytes: raw.sizeBytes,
          crc32: raw.crc32,
          visualInfo: raw.visualInfo,
          included: true
        };
        pathCollisionMap.set(`${newItem.targetFolder}/${newItem.finalName}`.toLowerCase(), newItem);
        queue.push(newItem);
      }
    }

    const hasAnyZipUpInUpload = queue.some((i) => i.included && i.isZipUp);
    if (config.topwearType === "Centered" && config.zipUpLetter && hasAnyZipUpInUpload) {
      const cleanDesignNum = String(config.designNumber).trim().replace(/^#+/, "");
      const mainPrefix = `#${cleanDesignNum} ${config.designLetter.toUpperCase()}`;
      const zipPrefix = `#${cleanDesignNum} ${config.zipUpLetter.toUpperCase()}`;
      const backFilesInMain = queue.filter(
        (i) =>
          i.included &&
          i.sourceRole === "Final File" &&
          i.targetFolder.startsWith(`Topwear DTF/${mainPrefix}/`) &&
          !i.targetFolder.includes("/White/") &&
          /\bback\b/i.test(i.originalName)
      );

      for (const backItem of backFilesInMain) {
        const zipTargetFolder = backItem.targetFolder.replace(`Topwear DTF/${mainPrefix}/`, `Topwear DTF/${zipPrefix}/`);
        const zipBackName = RenamingEngine.renameStandardFile(backItem.originalName, config.designNumber, config.zipUpLetter.toUpperCase()).finalName;
        const key = `${zipTargetFolder}/${zipBackName}`.toLowerCase();
        if (!pathCollisionMap.has(key)) {
          const clonedBack = {
            ...backItem,
            id: `item_${nextId++}`,
            finalName: zipBackName,
            category: "Topwear DTF (Zip Up)",
            targetFolder: zipTargetFolder,
            isZipUp: true
          };
          pathCollisionMap.set(key, clonedBack);
          queue.push(clonedBack);
        }
      }
    }
    return queue;
  },

  async buildUnifiedExportZip(queue, config, onProgress) {
    const outZip = new JSZip();
    const activeItems = queue.filter((item) => item.included && !item.autoExcluded);
    const onlyActive = config.onlyCreateActiveFolders !== false;
    const createdFoldersSet = new Set();

    if (!onlyActive) {
      const standardFolders = BreakPointConfig.getStandardFolders(config.designNumber, config.designLetter, config.topwearType, config.zipUpLetter);
      for (const folderPath of standardFolders) {
        outZip.folder(folderPath);
        createdFoldersSet.add(folderPath);
      }
    }

    const integrityLogs = [];
    for (let i = 0; i < activeItems.length; i++) {
      if (this.cancelRequested) throw new Error("Cancelado.");
      const item = activeItems[i];
      const cleanFolder = item.targetFolder.replace(/^\/+|\/+$/g, "");
      createdFoldersSet.add(cleanFolder);
      const fullZipPath = `${cleanFolder}/${item.finalName}`;
      outZip.file(fullZipPath, item.bytes, { binary: true });
      integrityLogs.push({ fullZipPath, sourceRole: item.sourceRole, crc32: BinaryUtils.crc32(item.bytes) });
      if (onProgress) {
        const stagePct = Math.max(1, Math.round(((i + 1) / Math.max(activeItems.length, 1)) * 15));
        onProgress(stagePct, `Preparando ${item.finalName}...`);
      }
      if (i % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }

    const blob = await outZip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      (metadata) => {
        if (onProgress) {
          const totalPct = Math.min(99, Math.max(15, Math.round(15 + (metadata.percent || 0) * 0.85)));
          const fileName = metadata.currentFile ? metadata.currentFile.split("/").pop() : "";
          onProgress(totalPct, fileName ? `Compactando ${fileName}...` : "Compactando pacote ZIP...");
        }
      }
    );
    if (onProgress) onProgress(100, "ZIP concluído!");
    return { blob, zipInstance: outZip, integrityLogs, createdFolders: Array.from(createdFoldersSet) };
  }
};

const MyStoreEngine = {
  /**
   * Mapeamento de nomes/apelidos de produtos que o usuário pode colocar no nome da pasta
   * junto com "#Número Letra" (ex: "Topwear #1234 A", "Zip Up #1234 B", "All Black #1234 A", "Bags #1234 B").
   */
  categoryAliases: [
    { canonical: "Topwear DTF", patterns: ["topwear dtf", "topwear", "top wear dtf", "top wear", "zip up", "zip-up", "zipup", "zip ups", "zipups"], isZipUpAlias: /^(zip\s*ups?|zip-ups?|zipups?)$/i },
    { canonical: "All Black", patterns: ["all black rashguards", "all black rashguard", "all black"] },
    { canonical: "Bags", patterns: ["bags", "bag"] },
    { canonical: "Bottom Wear DTF", patterns: ["bottom wear dtf", "bottom wear", "bottomwear dtf", "bottomwear", "shorts", "sweatpants", "joggers"] },
    { canonical: "Colored RashGuard", patterns: ["colored rashguards", "colored rashguard", "colored"] },
    { canonical: "Hats and Beanies", patterns: ["hats and beanies", "hats & beanies", "hats", "hat", "beanies", "beanie"] },
    { canonical: "No Gi", patterns: ["academy rashguards", "academy rashguard", "academy rash guards", "academy rash guard", "no gi rashguards", "no gi rashguard", "no gi", "nogi"] },
    { canonical: "Stickers", patterns: ["stickers", "sticker"] }
  ],

  normalizeGarmentKey(fileName) {
    let clean = String(fileName || "").split("/").pop().trim().replace(/\.[^.]+$/, "");
    clean = clean.replace(/^#+\d+(?:\s+[A-Za-z]\b)?\s+/, "");
    clean = clean.split(/\s+-\s+/)[0].trim().toLowerCase();
    clean = clean.replace(/\bmockups?\b/gi, "");
    clean = clean.replace(/\brashguards\b/gi, "rashguard");
    clean = clean.replace(/\brash\s+guards?\b/gi, "rashguard");
    clean = clean.replace(/\s+/g, " ").trim();
    return clean;
  },

  normalizeFolderKey(folderPath) {
    return String(folderPath || "")
      .replace(/^\/+|\/+$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  },

  /** Normaliza o nome de uma categoria raiz para comparação ("Colored RashGuards" == "Colored RashGuard"). */
  normalizeRootKey(rootName) {
    return String(rootName || "").toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");
  },

  /**
   * Detecta se um segmento de pasta representa uma categoria de produto Break Point,
   * mesmo quando escrito de forma abreviada ou acompanhado de "#Número Letra".
   */
  matchStandardRootSegment(segment) {
    const clean = String(segment || "").trim();
    for (const entry of this.categoryAliases) {
      for (const pat of entry.patterns) {
        const escaped = CategoryClassifier.escapeRegex(pat).replace(/\s+/g, "\\s+");
        const re = new RegExp(`^(${escaped})(?:\\s+mockups?)?(?:\\s*[-_]?\\s*#+\\s*(\\d+)?\\s*([A-Za-z]))?$`, "i");
        const m = clean.match(re);
        if (m) {
          return {
            categoryRoot: entry.canonical,
            inlineNumber: m[2] || null,
            inlineLetter: m[3] ? m[3].toUpperCase() : null,
            isZipUpFolder: Boolean(entry.isZipUpAlias && entry.isZipUpAlias.test(m[1]))
          };
        }
      }
    }
    return null;
  },

  isJunkEntry(path) {
    const base = path.split("/").pop();
    return base.startsWith("._") || base === ".DS_Store" || /^(desktop\.ini|thumbs\.db)$/i.test(base) || path.includes("__MACOSX/");
  },

  /**
   * Cria uma função que remove a pasta "embrulho" do ZIP (ex: "#458/..." ou "30Oct2026 - MY STORE/...")
   * somente quando TODOS os arquivos estão dentro dela e ela não é uma categoria de produto.
   */
  buildWrapperStripper(paths) {
    let depth = 0;
    while (true) {
      const splitPaths = paths.map((p) => p.split("/").filter(Boolean).slice(depth));
      if (splitPaths.length === 0 || splitPaths.some((parts) => parts.length < 2)) break;
      const firsts = new Set(splitPaths.map((parts) => parts[0]));
      if (firsts.size !== 1) break;
      const root = [...firsts][0];
      if (this.matchStandardRootSegment(root)) break;
      depth++;
    }
    return (p) => p.split("/").filter(Boolean).slice(depth).join("/");
  },

  /** Lê a letra do design pela pasta (ex: "#A", "#458 A", "All Black #1234 A", "Topwear #1234 B"). */
  folderLetterOf(dirPath) {
    const parts = String(dirPath || "").split("/").filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const m = parts[i].trim().match(/(?:^|\s)#+\s*(\d+)?\s*([A-Za-z])$/);
      if (m) return m[2].toUpperCase();
    }
    return null;
  },

  /** Troca "#NúmeroAntigo" por "#NúmeroNovo" em um segmento de pasta, mantendo a letra. */
  updateSegmentNumber(segment, newNumber) {
    return segment.replace(/#+\s*\d+(?=\s|$)/g, `#${newNumber}`);
  },

  buildClassifierConfig(designNumber, designLetter) {
    return {
      designNumber,
      designLetter,
      zipUpLetter: designLetter,
      topwearType: "Pocket",
      defaultAcademy: "My Store",
      onlyCreateActiveFolders: true,
      autoRemoveThumbnailsAndPatches: true,
      shareMockupsAdultKids: true,
      enableVisualAI: false
    };
  },

  isUnknownCategory(classification) {
    return !classification || classification.category === "Revisão Manual Necessária";
  },

  isZipUpName(fileName) {
    return /\b(zip\s*-?\s*ups?|zipups?)\b/i.test(fileName);
  },

  /**
   * Insere a pasta do design ("#8002 A") logo depois da categoria quando aquela categoria tem mais de 1 design.
   * Ex: "All Black/Rashguards/Adult" -> "All Black/#8002 A/Rashguards/Adult".
   * Topwear DTF já possui "#Número Letra" no padrão e não é alterado.
   */
  withDesignFolder(folder, designNumber, letter, multiDesignRoots, rootNameMap = null) {
    const parts = folder.split("/").filter(Boolean);
    if (parts.length === 0) return folder;
    if (rootNameMap) {
      const mapped = rootNameMap.get(this.normalizeRootKey(parts[0]));
      if (mapped) parts[0] = mapped;
    }
    if (this.normalizeRootKey(parts[0]) === this.normalizeRootKey("Topwear DTF")) return parts.join("/");
    if (multiDesignRoots.has(this.normalizeRootKey(parts[0]))) {
      return [parts[0], `#${designNumber} ${letter}`, ...parts.slice(1)].join("/");
    }
    return parts.join("/");
  },

  /**
   * Identifica se um arquivo do ZIP 1 (Pasta do Cliente) é Final File ou Mockup.
   */
  async isOldEntryFinalFile(fileName, bytes) {
    const baseNoExt = String(fileName).split("/").pop().trim().replace(/\.[^.]+$/, "");
    const unprefixed = baseNoExt.replace(/^#+\d+(?:\s+[A-Za-z]\b)?\s+/, "").trim();

    if (/\bfinal\s*files?\b/i.test(unprefixed)) return true;
    if (/\bmockups?\b/i.test(unprefixed)) return false;
    if (/^(back|front|left|right|sleeve|chest|pocket)\b/i.test(unprefixed) && !/\s+-\s+/i.test(unprefixed)) return true;
    if (/\s+-\s+(front\s+and\s+back|front|back|side|blue|brown|purple|white|black|ranked)\b/i.test(unprefixed)) return false;

    if (typeof VisualImageInspector !== "undefined" && VisualImageInspector.hasTransparentBackground) {
      try {
        return Boolean(await VisualImageInspector.hasTransparentBackground(bytes, fileName));
      } catch (e) {
        return false;
      }
    }
    return false;
  },

  async processMyStore(oldZipFile, newMockupsFile, mystoreCfg) {
    const num = String(mystoreCfg.newNumber || "").trim().replace(/^#+/, "");
    const replaceMode = mystoreCfg.replaceMode || "DELETE_ALL_OLD";

    const oldZip = await JSZip.loadAsync(await oldZipFile.arrayBuffer());
    const newZip = newMockupsFile ? await JSZip.loadAsync(await newMockupsFile.arrayBuffer()) : null;

    const oldKeys = Object.keys(oldZip.files).filter((k) => !oldZip.files[k].dir && !this.isJunkEntry(k));
    const newKeys = newZip ? Object.keys(newZip.files).filter((k) => !newZip.files[k].dir && !this.isJunkEntry(k)) : [];

    const stripOld = this.buildWrapperStripper(oldKeys);
    const stripNew = this.buildWrapperStripper(newKeys);

    const logs = [];
    const warnings = [];
    const stats = { keptFinalFilesCount: 0, deletedOldMockupsCount: 0, keptExistingMockupsCount: 0, addedNewMockupsCount: 0 };

    const outZip = new JSZip();
    const writtenPaths = new Set();
    const writtenList = [];
    const writeFile = (folder, fileName, bytes) => {
      let finalName = fileName;
      let fullPath = folder ? `${folder}/${finalName}` : finalName;
      let counter = 2;
      while (writtenPaths.has(fullPath.toLowerCase())) {
        const extMatch = fileName.match(/(\.[^.]+)$/);
        const ext = extMatch ? extMatch[1] : "";
        const base = ext ? fileName.slice(0, -ext.length) : fileName;
        finalName = `${base} (${counter++})${ext}`;
        fullPath = folder ? `${folder}/${finalName}` : finalName;
      }
      writtenPaths.add(fullPath.toLowerCase());
      writtenList.push(fullPath);
      outZip.file(fullPath, bytes, { binary: true });
      return fullPath;
    };

    // ============================================================
    // 1. ANALISA A PASTA DO CLIENTE (ZIP 1)
    // ============================================================
    const oldItems = [];
    for (const k of oldKeys) {
      const rel = stripOld(k);
      const name = rel.split("/").pop().trim();
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";

      if (ExclusionFilterEngine.isGiOrBeltPatch(name, rel)) {
        stats.deletedOldMockupsCount++;
        logs.push(`🚫 [Cliente] Patch ignorado: ${rel}`);
        continue;
      }

      const bytes = await oldZip.files[k].async("uint8array");
      const isFinal = await this.isOldEntryFinalFile(name, bytes);
      const pref = RenamingEngine.extractExistingPrefix(name);
      const letter = (pref && pref.letter) || this.folderLetterOf(dir) || null;

      let root = null;
      let unknown = true;
      if (isFinal) {
        const cls = CategoryClassifier.classifyFile(name, rel, this.buildClassifierConfig(num, letter || "A"), "Final File", null, true);
        unknown = this.isUnknownCategory(cls);
        root = unknown ? null : cls.targetFolder.split("/")[0];
      }
      oldItems.push({ rel, dir, name, bytes, isFinal, letter, root, unknown });
    }

    // Letras de cada categoria segundo os Final Files do cliente
    const finalLettersByRoot = new Map();
    const topwearZipLetters = new Set();
    const topwearMainLetters = new Set();
    const letterFrequency = new Map();
    for (const item of oldItems) {
      if (!item.isFinal || !item.letter) continue;
      letterFrequency.set(item.letter, (letterFrequency.get(item.letter) || 0) + 1);
      if (!item.root) continue;
      if (!finalLettersByRoot.has(item.root)) finalLettersByRoot.set(item.root, new Set());
      finalLettersByRoot.get(item.root).add(item.letter);
      if (item.root === "Topwear DTF") {
        (this.isZipUpName(item.name) ? topwearZipLetters : topwearMainLetters).add(item.letter);
      }
    }
    const defaultLetter = [...letterFrequency.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "A";

    const pickLetterFromPool = (pool, contextLabel) => {
      const sorted = pool ? [...pool].sort() : [];
      if (sorted.length === 1) return sorted[0];
      if (sorted.length > 1) {
        warnings.push(`⚠️ ${contextLabel}: sem letra definida e a categoria tem ${sorted.length} designs (${sorted.join(", ")}). Usado ${sorted[0]}.`);
        return sorted[0];
      }
      return defaultLetter;
    };

    // Final Files sem letra (ex: "#458 Duffel Bag ...") herdam a letra única da categoria
    for (const item of oldItems) {
      if (item.isFinal && !item.letter) {
        item.letter = item.root ? pickLetterFromPool(finalLettersByRoot.get(item.root), `Final File "${item.name}"`) : defaultLetter;
      }
    }

    // ============================================================
    // 2. ANALISA OS NOVOS MOCKUPS DA MY STORE (ZIP 2)
    // ============================================================
    const newItems = [];
    for (const k of newKeys) {
      const rel = stripNew(k);
      const name = rel.split("/").pop().trim();
      const dir = rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "";
      const folderLetter = this.folderLetterOf(dir);
      const pref = RenamingEngine.extractExistingPrefix(name);
      const explicitLetter = folderLetter || (pref && pref.letter) || null;

      const preCls = CategoryClassifier.classifyFile(name, rel, this.buildClassifierConfig(num, explicitLetter || defaultLetter), "Mockup");
      if (preCls.autoExcluded) {
        logs.push(`🚫 [My Store] Ignorado (${preCls.excludeReason || "thumbnail/patch"}): ${rel}`);
        continue;
      }
      if (this.isUnknownCategory(preCls)) {
        warnings.push(`⚠️ Mockup sem pasta padrão no Setup (não inserido): ${rel}`);
        continue;
      }

      const root = preCls.targetFolder.split("/")[0];
      let letter = explicitLetter;
      if (!letter) {
        let pool = finalLettersByRoot.get(root);
        if (root === "Topwear DTF") {
          if (this.isZipUpName(name) && topwearZipLetters.size > 0) pool = topwearZipLetters;
          else if (topwearMainLetters.size > 0) pool = topwearMainLetters;
        }
        letter = pickLetterFromPool(pool, `Mockup "${rel}"`);
      }

      const cls = CategoryClassifier.classifyFile(name, rel, this.buildClassifierConfig(num, letter), "Mockup");
      const folders = cls.sharedAdultKidsFolders && cls.sharedAdultKidsFolders.length > 0 ? cls.sharedAdultKidsFolders : [cls.targetFolder];
      const bytes = await newZip.files[k].async("uint8array");
      newItems.push({ rel, name, bytes, letter, root, folders, sig: this.normalizeGarmentKey(name) });
    }

    // ============================================================
    // 3. MONTA A PASTA FINAL
    // ============================================================
    const addNewMockups = (multiRoots, rootNameMap) => {
      for (const item of newItems) {
        const renamed = RenamingEngine.renameStandardFile(item.name, num, item.letter).finalName;
        for (const folder of item.folders) {
          const target = this.withDesignFolder(folder, num, item.letter, multiRoots, rootNameMap);
          const written = writeFile(target, renamed, item.bytes);
          stats.addedNewMockupsCount++;
          logs.push(`✨ [Novo Mockup (${item.letter})] ${written}`);
        }
      }
    };

    const keepWithOriginalFolder = (item, letter) => {
      const folder = item.dir.split("/").filter(Boolean).map((seg) => this.updateSegmentNumber(seg, num)).join("/");
      const renamed = RenamingEngine.renameStandardFile(item.name, num, letter).finalName;
      return writeFile(folder, renamed, item.bytes);
    };

    if (replaceMode === "DELETE_ALL_OLD") {
      // CLIENTE ANTIGO: Final Files do cliente + Mockups da My Store no padrão de pastas do Setup.
      const placedFinals = [];
      const lettersPerRoot = new Map();
      const addLetter = (root, letter) => {
        const key = this.normalizeRootKey(root);
        if (!lettersPerRoot.has(key)) lettersPerRoot.set(key, { root, letters: new Set() });
        lettersPerRoot.get(key).letters.add(letter);
      };

      for (const item of oldItems) {
        if (!item.isFinal) {
          stats.deletedOldMockupsCount++;
          logs.push(`🗑️ [Mockup antigo removido] ${item.rel}`);
          continue;
        }
        if (item.unknown) {
          placedFinals.push({ item, folder: null });
          continue;
        }
        const cls = CategoryClassifier.classifyFile(item.name, item.rel, this.buildClassifierConfig(num, item.letter), "Final File", null, true);
        placedFinals.push({ item, folder: cls.targetFolder });
        addLetter(cls.targetFolder.split("/")[0], item.letter);
      }
      for (const item of newItems) addLetter(item.root, item.letter);

      const multiRoots = new Set();
      for (const [key, info] of lettersPerRoot.entries()) {
        if (key === this.normalizeRootKey("Topwear DTF")) continue;
        if (info.letters.size > 1) {
          multiRoots.add(key);
          logs.push(`📂 ${info.root}: ${info.letters.size} designs (${[...info.letters].sort().join(", ")}) → criando subpastas #${num} + letra`);
        }
      }

      for (const { item, folder } of placedFinals) {
        let written;
        if (folder === null) {
          written = keepWithOriginalFolder(item, item.letter);
          warnings.push(`⚠️ Final File sem categoria no Setup, mantido na pasta original: ${written}`);
        } else {
          const target = this.withDesignFolder(folder, num, item.letter, multiRoots);
          const renamed = RenamingEngine.renameStandardFile(item.name, num, item.letter).finalName;
          written = writeFile(target, renamed, item.bytes);
        }
        stats.keptFinalFilesCount++;
        logs.push(`📁 [Final File (${item.letter})] ${written}`);
      }

      addNewMockups(multiRoots, null);
    } else {
      // CLIENTE NOVO: pasta já está no padrão. Mantém tudo, remove só os mockups que têm substituto no ZIP novo.
      const newSigsByLetter = new Map();
      for (const item of newItems) {
        if (!newSigsByLetter.has(item.letter)) newSigsByLetter.set(item.letter, new Set());
        newSigsByLetter.get(item.letter).add(item.sig);
      }

      // Descobre os nomes reais das categorias no ZIP 1 e quais já usam subpasta "#Número Letra"
      const rootNameMap = new Map();
      const multiRoots = new Set();
      for (const item of oldItems) {
        const parts = item.dir.split("/").filter(Boolean);
        if (parts.length === 0) continue;
        const key = this.normalizeRootKey(parts[0]);
        if (!rootNameMap.has(key)) rootNameMap.set(key, parts[0]);
        if (parts.length >= 2 && /^#+\s*\d*\s*[A-Za-z]$/.test(parts[1].trim())) multiRoots.add(key);
      }
      const newLettersPerRoot = new Map();
      for (const item of newItems) {
        const key = this.normalizeRootKey(item.root);
        if (!newLettersPerRoot.has(key)) newLettersPerRoot.set(key, new Set());
        newLettersPerRoot.get(key).add(item.letter);
      }
      for (const [key, letters] of newLettersPerRoot.entries()) {
        if (letters.size > 1) multiRoots.add(key);
      }

      for (const item of oldItems) {
        const letter = item.letter || defaultLetter;
        if (!item.isFinal) {
          const sig = this.normalizeGarmentKey(item.name);
          const replaced = newSigsByLetter.get(letter)?.has(sig);
          const isThumb = ExclusionFilterEngine.isMultiColorMockupThumbnail(item.name, item.rel, "Mockup").excluded;
          if (replaced || isThumb) {
            stats.deletedOldMockupsCount++;
            logs.push(`🗑️ [Mockup substituído (${letter})] ${item.rel}`);
            continue;
          }
          const written = keepWithOriginalFolder(item, letter);
          stats.keptExistingMockupsCount++;
          logs.push(`✅ [Mockup mantido (${letter})] ${written}`);
          continue;
        }
        const written = keepWithOriginalFolder(item, letter);
        stats.keptFinalFilesCount++;
        logs.push(`📁 [Final File (${letter})] ${written}`);
      }

      addNewMockups(multiRoots, rootNameMap);
    }

    const blob = await outZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return {
      blob,
      logs: [...warnings, ...logs],
      writtenPaths: writtenList,
      stats
    };
  }
};
