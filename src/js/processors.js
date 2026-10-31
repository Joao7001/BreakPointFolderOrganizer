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
          const mainPrefix = `#${config.designNumber} ${config.designLetter.toUpperCase()}`;
          const zipPrefix = `#${config.designNumber} ${(config.zipUpLetter || "B").toUpperCase()}`;

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
      const mainPrefix = `#${config.designNumber} ${config.designLetter.toUpperCase()}`;
      const zipPrefix = `#${config.designNumber} ${config.zipUpLetter.toUpperCase()}`;
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
      if (onProgress) onProgress(Math.round(((i + 1) / activeItems.length) * 100), `Empacotando ${fullZipPath}...`);
    }

    const blob = await outZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return { blob, zipInstance: outZip, integrityLogs, createdFolders: Array.from(createdFoldersSet) };
  }
};

const MyStoreEngine = {
  normalizeGarmentKey(fileName) {
    let clean = fileName.split("/").pop().replace(/\.[^.]+$/, "");
    clean = clean.replace(/^#\d+\s+[A-Za-z0-9]+\s+/, "");
    clean = clean.split(/\s+-\s+/)[0].trim().toLowerCase();
    clean = clean.replace(/\s+/g, " ");
    return clean;
  },

  stripLeadingFolderWrapper(relPath) {
    const standardRoots = [
      "all black", "bags", "bottom wear dtf", "colored rashguard",
      "hats and beanies", "no gi", "stickers", "topwear dtf"
    ];
    const parts = relPath.split("/").filter(Boolean);
    for (let i = 0; i < parts.length - 1; i++) {
      if (standardRoots.includes(parts[i].toLowerCase())) {
        return parts.slice(i).join("/");
      }
    }
    return parts.join("/");
  },

  async processMyStore(oldZipFile, newMockupsFile, mystoreCfg) {
    const { oldPrefix, newNumber, newLetter, topwearType, zipUpLetter, replaceMode } = mystoreCfg;
    const oldArrayBuffer = await oldZipFile.arrayBuffer();
    const oldZip = await JSZip.loadAsync(oldArrayBuffer);
    const newArrayBuffer = await newMockupsFile.arrayBuffer();
    const newMockupsZip = await JSZip.loadAsync(newArrayBuffer);

    const outZip = new JSZip();
    const logs = [];

    const classifierConfig = {
      designNumber: newNumber,
      designLetter: newLetter.toUpperCase(),
      topwearType,
      zipUpLetter: (zipUpLetter || "B").toUpperCase(),
      defaultAcademy: "My Store",
      onlyCreateActiveFolders: true,
      autoRemoveThumbnailsAndPatches: true,
      shareMockupsAdultKids: true,
      enableVisualAI: false
    };

    // 1. Inspeciona primeiro o ZIP 2 (Novos Mockups) para saber exatamente quais mockups vieram para substituir
    const newMockupKeys = Object.keys(newMockupsZip.files).filter((k) => {
      if (newMockupsZip.files[k].dir) return false;
      const base = k.split("/").pop();
      return !(base.startsWith("._") || base === ".DS_Store" || k.includes("__MACOSX/"));
    });

    const incomingMockupSignatures = new Set();
    const incomingCategories = new Set();
    const validNewMockups = [];

    for (const k of newMockupKeys) {
      const originalName = k.split("/").pop();
      const bytes = await newMockupsZip.files[k].async("uint8array");
      const classification = CategoryClassifier.classifyFile(originalName, k, classifierConfig, "Mockup");

      if (classification.autoExcluded) {
        logs.push(`🚫 [ZIP Novo] Thumbnail/Patch ignorado: ${originalName}`);
        continue;
      }

      const sig = this.normalizeGarmentKey(originalName);
      incomingMockupSignatures.add(sig);
      incomingCategories.add(classification.category);
      validNewMockups.push({ originalName, relativePath: k, bytes, classification, sig });
    }

    // 2. Varre o ZIP 1 (Pasta Pronta do Cliente)
    let keptFinalFilesCount = 0;
    let deletedOldMockupsCount = 0;
    let keptExistingMockupsCount = 0;

    const oldFiles = Object.keys(oldZip.files).filter((k) => {
      if (oldZip.files[k].dir) return false;
      const base = k.split("/").pop();
      return !(base.startsWith("._") || base === ".DS_Store" || k.includes("__MACOSX/"));
    });

    for (const k of oldFiles) {
      const cleanRelPath = this.stripLeadingFolderWrapper(k);
      const fileName = cleanRelPath.split("/").pop();
      const isMockup = /\bmockups?\b/i.test(fileName) && !/\bfinal\s*files?\b/i.test(fileName);

      const isZipUpItem =
        topwearType === "Centered" &&
        (/\b(zip\s*ups?|zip-ups?|zipups?|sherpa\s+zip\s*up|varsity\s+zip\s*up)\b/i.test(cleanRelPath) ||
          (oldPrefix && !cleanRelPath.includes(oldPrefix) && /Topwear DTF\/#\d+\s+[A-Za-z0-9]+\//i.test(cleanRelPath)));

      const targetLetterForItem = (topwearType === "Centered" && isZipUpItem)
        ? (zipUpLetter || "B").toUpperCase()
        : newLetter.toUpperCase();

      const targetPrefixForItem = `#${newNumber} ${targetLetterForItem}`;

      if (isMockup) {
        const oldSig = this.normalizeGarmentKey(fileName);
        const shouldDeleteMockup =
          replaceMode === "DELETE_ALL_OLD" ||
          incomingMockupSignatures.has(oldSig) ||
          ExclusionFilterEngine.isGiOrBeltPatch(fileName, cleanRelPath) ||
          ExclusionFilterEngine.isMultiColorMockupThumbnail(fileName, cleanRelPath, "Mockup").excluded;

        if (shouldDeleteMockup) {
          deletedOldMockupsCount++;
          logs.push(`🗑️ [Substituído/Removido] Mockup antigo: ${cleanRelPath}`);
          continue;
        }

        const bytes = await oldZip.files[k].async("uint8array");
        const renamedMockup = RenamingEngine.renameStandardFile(fileName, newNumber, targetLetterForItem).finalName;
        let updatedFolder = cleanRelPath.includes("/") ? cleanRelPath.slice(0, cleanRelPath.lastIndexOf("/")) : "Stickers";
        updatedFolder = updatedFolder.replace(/Topwear DTF\/#\d+\s+[A-Za-z0-9]+/gi, `Topwear DTF/${targetPrefixForItem}`);

        const finalPath = `${updatedFolder}/${renamedMockup}`;
        outZip.file(finalPath, bytes, { binary: true });
        keptExistingMockupsCount++;
        logs.push(`✅ [Mockup Cliente Novo Mantido + Renomeado] ${finalPath}`);
        continue;
      }

      if (ExclusionFilterEngine.isGiOrBeltPatch(fileName, cleanRelPath)) {
        continue;
      }

      const bytes = await oldZip.files[k].async("uint8array");
      const renamedFinal = RenamingEngine.renameStandardFile(fileName, newNumber, targetLetterForItem).finalName;
      let updatedFolder = cleanRelPath.includes("/") ? cleanRelPath.slice(0, cleanRelPath.lastIndexOf("/")) : "";
      if (!updatedFolder) {
        const c = CategoryClassifier.classifyFile(fileName, cleanRelPath, classifierConfig, "Final File");
        updatedFolder = c.targetFolder;
      } else {
        updatedFolder = updatedFolder.replace(/Topwear DTF\/#\d+\s+[A-Za-z0-9]+/gi, `Topwear DTF/${targetPrefixForItem}`);
      }

      const finalPath = `${updatedFolder}/${renamedFinal}`;
      outZip.file(finalPath, bytes, { binary: true });
      keptFinalFilesCount++;
      logs.push(`📁 [Final File Atualizado] ${finalPath}`);
    }

    // 3. Adiciona os Novos Mockups do ZIP 2 com o Novo #Número Letra
    let addedNewMockupsCount = 0;
    for (const item of validNewMockups) {
      const { originalName, bytes, classification } = item;
      const activeLetter = (topwearType === "Centered" && classification.isZipUp)
        ? (zipUpLetter || "B").toUpperCase()
        : newLetter.toUpperCase();

      const renameRes = RenamingEngine.renameStandardFile(originalName, newNumber, activeLetter);
      const targetFolders = classification.sharedAdultKidsFolders && classification.sharedAdultKidsFolders.length > 0
        ? classification.sharedAdultKidsFolders
        : [classification.targetFolder];

      for (const folder of targetFolders) {
        const fullZipPath = `${folder}/${renameRes.finalName}`;
        outZip.file(fullZipPath, bytes, { binary: true });
        addedNewMockupsCount++;
        logs.push(`✨ [Novo Mockup Inserido] ${fullZipPath}`);
      }
    }

    const blob = await outZip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    return {
      blob,
      logs,
      stats: {
        keptFinalFilesCount,
        deletedOldMockupsCount,
        keptExistingMockupsCount,
        addedNewMockupsCount
      }
    };
  }
};
