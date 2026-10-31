/**
 * Break Point — Motor de Exclusão de Thumbnails/Patches, Renomeação e Classificação Inteligente
 */

const ExclusionFilterEngine = {
  isGiOrBeltPatch(fileName, relativePath = "") {
    const combined = `${relativePath} ${fileName}`.toLowerCase();
    return /\b(gi\s*[-_]?\s*patch(?:es)?|gipatch(?:es)?|belt\s*[-_]?\s*patch(?:es)?|beltpatch(?:es)?|patch(?:es)?\s+final\s*file|patch(?:es)?\s+mockup)\b/i.test(combined);
  },

  isMultiColorMockupThumbnail(fileName, relativePath = "", sourceRole = "Mockup") {
    const cleanName = fileName.split("/").pop();
    const combined = `${relativePath} ${cleanName}`.toLowerCase();

    if (sourceRole === "Final File" || /\bfinal\s*files?\b/i.test(cleanName)) {
      return { excluded: false, reason: null };
    }

    let productPart = cleanName.replace(/\.[^.]+$/, "");
    productPart = productPart.replace(/^#\d+\s+[A-Za-z0-9]+\s+/, "");
    productPart = productPart.split(/\s+-\s+/)[0].trim().toLowerCase();

    if (/\b(rash\s*guards?|rashguards?|no\s*gi|nogi|hat|hats|beanie|beanies|cap|perforated|bon[eé]|gorro|stickers?)\b/i.test(productPart)) {
      return { excluded: false, reason: null };
    }
    if (/\b(thumbnails?|thumbs?|all\s*colors?|multi\s*[-_]?\s*colors?|color\s*variations?|colorways?|collage|collection\s*mockup|bundle\s*mockup|cover\s*mockup)\b/i.test(combined)) {
      return { excluded: true, reason: "Mockup Thumbnail (múltiplas variações de cor)." };
    }
    if (/^basketball\s+jerseys?(?:\s+2\.0)?\s+mockups?$/i.test(productPart)) {
      return { excluded: true, reason: "Mockup Thumbnail de Basketball Jersey." };
    }
    if (/\b(shirts|t-shirts|tees|hoodies|sweatshirts|tank\s+tops|jerseys|bags|backpacks|duffels)\b/i.test(productPart)) {
      return { excluded: true, reason: "Mockup Thumbnail em lote." };
    }
    if (/^(topwear|bottom\s*wear|(?:womens\s+|kids\s+|adult\s+)?(?:sweat\s*shorts?|sweat\s*pants?|joggers?|shorts?))(?:\s+2\.0)?\s+mockups?$/i.test(productPart)) {
      return { excluded: true, reason: "Mockup Thumbnail de Bottom Wear." };
    }

    const customMem = VisualMemoryEngine.getCustomMemory();
    const sig = VisualMemoryEngine.extractGarmentSignature(cleanName);
    if (customMem[sig] && customMem[sig].neverExclude) {
      return { excluded: false, reason: null };
    }
    return { excluded: false, reason: null };
  }
};

const RenamingEngine = {
  extractExistingPrefix(fileName) {
    const match = fileName.match(/^#(\d+)\s+([A-Za-z0-9]+)\s+(.*)$/);
    if (!match) return null;
    return { number: match[1], letter: match[2].toUpperCase(), restOfName: match[3] };
  },

  buildPrefix(designNumber, designLetter) {
    return `#${String(designNumber).trim()} ${String(designLetter).trim().toUpperCase()}`;
  },

  renameStandardFile(originalFileName, targetNumber, targetLetter) {
    const cleanName = originalFileName.split("/").pop();
    const desiredPrefix = this.buildPrefix(targetNumber, targetLetter);
    const existing = this.extractExistingPrefix(cleanName);

    if (existing) {
      if (existing.number === String(targetNumber).trim() && existing.letter === String(targetLetter).trim().toUpperCase()) {
        return { finalName: cleanName, alreadyPrefixed: true };
      }
      return { finalName: `${desiredPrefix} ${existing.restOfName}`, alreadyPrefixed: false };
    }
    return { finalName: `${desiredPrefix} ${cleanName}`, alreadyPrefixed: false };
  },

  isStickerFile(fileName, relativePath = "") {
    return /\bstickers?\b/i.test(`${relativePath} ${fileName}`);
  },

  isStickerMockup(fileName, sourceRole = "") {
    if (/\bfinal\s*files?\b/i.test(fileName)) return false;
    return sourceRole === "Mockup" || /\bmockups?\b/i.test(fileName);
  },

  expandStickerVersions(originalFileName, designNumber, designLetter, fallbackAcademy = "") {
    const cleanName = originalFileName.split("/").pop();
    const extMatch = cleanName.match(/(\.[^.]+)$/);
    const ext = extMatch ? extMatch[1] : "";
    const baseWithoutExt = extMatch ? cleanName.slice(0, -ext.length) : cleanName;

    const existing = this.extractExistingPrefix(baseWithoutExt);
    const unprefixedBase = existing ? existing.restOfName.trim() : baseWithoutExt.trim();
    const hasInchesAlreadyWritten = /\binch(?:es)?\b/i.test(unprefixedBase);
    const existingInchesWordMatch = unprefixedBase.match(/\b(inches|inch)\b/i);
    const inchesUnitWord = existingInchesWordMatch
      ? (existingInchesWordMatch[1][0] === "I" ? "Inches" : "inches")
      : "inches";

    const rawParts = unprefixedBase.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
    const cleanedParts = [];
    for (let part of rawParts) {
      part = part.replace(/^stickers?\b\s*/i, "").trim();
      part = part.replace(/^(?:\d+(?:\.\d+)?\s*)?(?:inches|inch|in|")\b\s*/i, "").trim();
      if (part) cleanedParts.push(part);
    }

    let docTypeLabel = "Final File";
    const academyParts = [];
    for (const p of cleanedParts) {
      if (/^(final\s*files?|mockups?)$/i.test(p)) {
        docTypeLabel = /mockup/i.test(p) ? "Mockup" : "Final File";
      } else {
        let cleanedAcademy = p.replace(/\b(final\s*files?|mockups?)\b/gi, "").replace(/^-\s*|\s*-$/g, "").trim();
        cleanedAcademy = cleanedAcademy.replace(/\b(?:\d+(?:\.\d+)?\s*)?(?:inches|inch)\b/gi, "").replace(/^-\s*|\s*-$/g, "").trim();
        if (cleanedAcademy) academyParts.push(cleanedAcademy);
      }
    }

    let academyName = academyParts.join(" - ").trim();
    let needsAcademyReview = false;
    if (!academyName) {
      academyName = (fallbackAcademy && fallbackAcademy.trim() !== "") ? fallbackAcademy.trim() : "Academia_Revisar";
      if (!fallbackAcademy || fallbackAcademy.trim() === "") needsAcademyReview = true;
    }

    const prefix = this.buildPrefix(designNumber, designLetter);
    const versions = BreakPointConfig.stickerNumbers.map((numStr) => {
      const sizeSegment = hasInchesAlreadyWritten ? `${numStr} ${inchesUnitWord}` : `${numStr} inches`;
      return {
        size: sizeSegment,
        finalName: `${prefix} Stickers - ${sizeSegment} - ${docTypeLabel} - ${academyName}${ext}`,
        academyName,
        hasInchesAlreadyWritten,
        needsAcademyReview
      };
    });

    return { academyName, hasInchesAlreadyWritten, needsAcademyReview, versions };
  }
};

const CategoryClassifier = {
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  hasWholePhrase(text, phrase) {
    const pattern = `\\b${this.escapeRegex(phrase.toLowerCase()).replace(/\s+/g, "\\s+")}\\b`;
    return new RegExp(pattern, "i").test(text);
  },

  cleanProductPartForColor(fileName) {
    let base = fileName.split("/").pop().replace(/\.[^.]+$/, "");
    base = base.replace(/^#\d+\s+[A-Za-z0-9]+\s+/, "");
    base = base.replace(/\(rectangle\)/gi, " ");
    base = base.replace(/\b(final\s*files?|mockups?)\s*-\s*.*$/i, "$1");
    return base.trim().toLowerCase();
  },

  detectColorGroup(fileName, relativePath = "", allowWhite = true) {
    const lower = this.cleanProductPartForColor(fileName);
    if (allowWhite && (/\bwhite\s+dtf\b/i.test(lower) || /\bdtf\s+white\b/i.test(lower))) return "White";
    if (/\bblack\s+dtf\b/i.test(lower) || /\bdtf\s+black\b/i.test(lower)) return "Black";
    if (/\bdarker\s+colors?\b/i.test(lower)) return "Darker Colors";
    if (/\blight\s+colors?\b/i.test(lower)) return "Light Colors";

    const mem = VisualMemoryEngine.queryMemory(fileName);
    if (mem && mem.colorGroup) {
      if (!allowWhite && mem.colorGroup === "White") return "Light Colors";
      return mem.colorGroup;
    }

    if (/\bsherpa\b/i.test(lower)) return "Darker Colors";
    if (/\bblack\s+camo\b/i.test(lower)) return "Darker Colors";
    if (allowWhite && /\bwhite\b/i.test(lower)) return "White";
    if (/\bblack\b/i.test(lower) && !/\ball\s*black\b/i.test(lower)) return "Black";
    if (/\b(dry\s*fit\s+gr[ae]y|gr[ae]y\s+joggers?)\b/i.test(lower)) return "Darker Colors";
    if (/\b(heather\s+gr[ae]y|light\s+gr[ae]y)\b/i.test(lower)) return "Light Colors";
    if (/\b(columbia\s+blue|baby\s+blue|sky\s+blue|light\s+blue)\b/i.test(lower)) return "Light Colors";
    if (/\b(royal\s+blue|midnight\s+navy|navy)\b/i.test(lower)) return "Darker Colors";

    for (const kw of BreakPointConfig.darkerColorsKeywords) {
      if (this.hasWholePhrase(lower, kw)) return "Darker Colors";
    }
    for (const kw of BreakPointConfig.lightColorsKeywords) {
      if (this.hasWholePhrase(lower, kw)) return "Light Colors";
    }

    if (/\bblue\b/i.test(lower)) return "Darker Colors";
    if (/\bgr[ae]y\b/i.test(lower)) return "Light Colors";
    return null;
  },

  detectAgeGroup(text) {
    const lower = text.toLowerCase();
    const hasAdult = /\b(adult|adults|adulto)\b/i.test(lower);
    const hasKids = /\b(kids|kid|youth|infantil|crianca)\b/i.test(lower);
    if (hasAdult && hasKids) return "BOTH_CONFLICT";
    if (hasAdult) return "Adult";
    if (hasKids) return "Kids";
    return null;
  },

  detectShortsInches(text) {
    const has55 = /\b5[.,]5\s*(?:inches|inch|in|")/i.test(text);
    const has45 = /\b4[.,]5\s*(?:inches|inch|in|")/i.test(text);
    if (has55 && has45) return "CONFLICT_SIZES";
    if (has55) return "5.5";
    if (has45) return "4.5";
    return null;
  },

  detectSweatInches(text) {
    const has25 = /\b2[.,]5\s*(?:inches|inch|in|")?/i.test(text);
    const has30 = /\b3(?:[.,]0)?\s*(?:inches|inch|in|")\b/i.test(text);
    if (has25 && has30) return "CONFLICT_SIZES";
    if (has25) return "2.5";
    if (has30) return "3";
    return null;
  },

  isSeparatedZipUpFile(originalName, relativePath, config) {
    if (config.topwearType !== "Centered") return false;
    const productOnly = this.cleanProductPartForColor(originalName);
    if (/\b(zip\s*ups?|zip-ups?|zipups?|sherpa\s+zip\s*up|varsity\s+zip\s*up|pocket\s*logo|pocket)\b/i.test(productOnly)) {
      return true;
    }
    const zipLetter = (config.zipUpLetter || "B").trim().toUpperCase();
    const mainLetter = (config.designLetter || "A").trim().toUpperCase();
    if (zipLetter && zipLetter !== mainLetter) {
      const existing = RenamingEngine.extractExistingPrefix(originalName.split("/").pop());
      if (existing && existing.number === String(config.designNumber).trim() && existing.letter === zipLetter) {
        return true;
      }
      if (new RegExp(`#${config.designNumber}\\s*${zipLetter}\\b`, "i").test(relativePath)) {
        return true;
      }
    }
    return false;
  },

  classifyFile(originalName, relativePath, config, sourceRole = "Final File", visualInfo = null, forceInclude = false) {
    const productNameClean = this.cleanProductPartForColor(originalName);
    const fileNameOnlyLower = originalName.split("/").pop().toLowerCase();
    const { designNumber, designLetter, zipUpLetter } = config;
    const mainPrefix = `#${designNumber} ${designLetter.toUpperCase()}`;
    const zipPrefix = `#${designNumber} ${(zipUpLetter || "B").toUpperCase()}`;

    const hasFinalFileInName = /\bfinal\s*files?\b/i.test(originalName);
    const hasMockupInName = /\bmockups?\b/i.test(originalName) && !hasFinalFileInName;
    const effectiveRole = hasFinalFileInName ? "Final File" : (hasMockupInName ? "Mockup" : sourceRole);
    const isMockupFile = effectiveRole === "Mockup";
    const memMatch = (visualInfo && visualInfo.memoryHit) || VisualMemoryEngine.queryMemory(originalName);

    const warnings = [];
    let needsReview = false;
    let reviewType = null;

    if (!forceInclude && config.autoRemoveThumbnailsAndPatches !== false) {
      if (ExclusionFilterEngine.isGiOrBeltPatch(originalName, relativePath)) {
        return {
          effectiveRole,
          category: "Removido (Gi/Belt Patch)",
          targetFolder: "Excluído Automaticamente",
          sharedAdultKidsFolders: null,
          isSticker: false,
          isStickerMockup: false,
          isZipUp: false,
          needsReview: false,
          reviewType: null,
          autoExcluded: true,
          excludeReason: "Excluído automaticamente: Gi Patch / Belt Patch.",
          warnings: []
        };
      }
      const thumbCheck = ExclusionFilterEngine.isMultiColorMockupThumbnail(originalName, relativePath, effectiveRole);
      if (thumbCheck.excluded) {
        return {
          effectiveRole,
          category: "Removido (Thumbnail Multi-cor)",
          targetFolder: "Excluído Automaticamente",
          sharedAdultKidsFolders: null,
          isSticker: false,
          isStickerMockup: false,
          isZipUp: false,
          needsReview: false,
          reviewType: null,
          autoExcluded: true,
          excludeReason: thumbCheck.reason,
          warnings: []
        };
      }
    }

    if (RenamingEngine.isStickerFile(originalName, relativePath)) {
      return {
        effectiveRole,
        category: "Stickers",
        targetFolder: "Stickers",
        sharedAdultKidsFolders: null,
        isSticker: true,
        isStickerMockup: RenamingEngine.isStickerMockup(originalName, effectiveRole),
        isZipUp: false,
        needsReview: false,
        reviewType: null,
        autoExcluded: false,
        warnings: []
      };
    }

    if (/\b(hat|hats|beanie|beanies|cap|bon[eé]|gorro)\b/i.test(productNameClean)) {
      return {
        effectiveRole,
        category: "Hats and Beanies",
        targetFolder: "Hats and Beanies",
        sharedAdultKidsFolders: null,
        isSticker: false,
        isStickerMockup: false,
        isZipUp: false,
        needsReview: false,
        reviewType: null,
        autoExcluded: false,
        warnings: []
      };
    }

    if (/\b(bag|bags|backpack|duffel|crossbody|drawstring|mochila|bolsa)\b/i.test(productNameClean)) {
      let bagSize = memMatch?.bagSize || "8 Inches";
      if (/\b4\s*(?:inches|inch|in|")\b/i.test(productNameClean) || /\bcrossbody\b/i.test(productNameClean)) bagSize = "4 Inches";
      else if (/\b6\s*(?:inches|inch|in|")\b/i.test(productNameClean) || /\b(hybrid\s+backpack|small\s+duffel)\b/i.test(productNameClean)) bagSize = "6 Inches";
      else if (/\b8\s*(?:inches|inch|in|")\b/i.test(productNameClean) || /\btravel\s+backpack\b/i.test(productNameClean)) bagSize = "8 Inches";
      else if (/\b10\s*(?:inches|inch|in|")\b/i.test(productNameClean) || /\b(drawstring|giant\s+rolling)\b/i.test(productNameClean)) bagSize = "10 Inches";
      else if (!memMatch?.bagSize) {
        needsReview = true;
        reviewType = "BAG_SIZE";
        warnings.push("Tamanho da Bag não identificado.");
      }
      return {
        effectiveRole,
        category: "Bags",
        targetFolder: `Bags/Black/${bagSize}`,
        sharedAdultKidsFolders: null,
        isSticker: false,
        isStickerMockup: false,
        isZipUp: false,
        needsReview,
        reviewType,
        autoExcluded: false,
        warnings
      };
    }

    // RASHGUARDS (Prioridade absoluta antes de Bottom Wear)
    const isRashguardOrNoGi = /\b(rash\s*guards?|rashguards?|no\s*gi|nogi)\b/i.test(productNameClean);
    if (isRashguardOrNoGi) {
      const explicitAge = this.detectAgeGroup(productNameClean);
      const age = explicitAge === "Kids" ? "Kids" : "Adult";
      const shareBoth = isMockupFile && !explicitAge && config.shareMockupsAdultKids;

      if (/\ball\s*black\b/i.test(productNameClean)) {
        return {
          effectiveRole,
          category: "All Black",
          targetFolder: `All Black/Rashguards/${age}`,
          sharedAdultKidsFolders: shareBoth ? ["All Black/Rashguards/Adult", "All Black/Rashguards/Kids"] : null,
          isSticker: false,
          isStickerMockup: false,
          isZipUp: false,
          needsReview: false,
          reviewType: null,
          autoExcluded: false,
          warnings: []
        };
      }

      const mentionsNoGi = /\bno\s*gi\b|\bnogi\b/i.test(productNameClean);
      const isGenericNoGiRashguardName = /^(?:adult\s+|kids\s+)?rash\s*guards?(?:\s+(?:adult|kids))?\s+(?:mockups?|final\s*files?)$/i.test(productNameClean);
      const detectedRashColor = this.detectColorGroup(originalName, "", true);
      const isColoredRashguard =
        !mentionsNoGi &&
        !isGenericNoGiRashguardName &&
        !(/\(rectangle\)/i.test(originalName)) &&
        (/\b(light\s+colors?|darker\s+colors?|colored)\s+rash\s*guards?\b/i.test(productNameClean) || detectedRashColor !== null);

      if (isColoredRashguard) {
        return {
          effectiveRole,
          category: "Colored RashGuard",
          targetFolder: `Colored RashGuard/${age}`,
          sharedAdultKidsFolders: shareBoth ? ["Colored RashGuard/Adult", "Colored RashGuard/Kids"] : null,
          isSticker: false,
          isStickerMockup: false,
          isZipUp: false,
          needsReview: false,
          reviewType: null,
          autoExcluded: false,
          warnings: []
        };
      }

      return {
        effectiveRole,
        category: "No Gi",
        targetFolder: `No Gi/Rashguards/${age}`,
        sharedAdultKidsFolders: shareBoth ? ["No Gi/Rashguards/Adult", "No Gi/Rashguards/Kids"] : null,
        isSticker: false,
        isStickerMockup: false,
        isZipUp: false,
        needsReview: false,
        reviewType: null,
        autoExcluded: false,
        warnings: []
      };
    }

    // Bottom Wear DTF
    const isSweatOrJogger = /\b(sweat\s*pants?|sweatpants?|sweat\s*shorts?|sweatshorts?|joggers?|cal[cç]a|women'?s?\s+sweat)/i.test(productNameClean);
    const shortsInchesDetected = this.detectShortsInches(fileNameOnlyLower);
    const sweatInchesDetected = this.detectSweatInches(fileNameOnlyLower);
    const isShortsOrBottomWear =
      !isSweatOrJogger &&
      ((/\bshorts\b/i.test(productNameClean) && !/\bshort\s*sleeves?\b/i.test(productNameClean)) ||
        /\bbottom\s*wear\b/i.test(productNameClean) ||
        shortsInchesDetected !== null);

    if (isSweatOrJogger || (/\bbottom\s*wear\b/i.test(productNameClean) && sweatInchesDetected !== null)) {
      let colorGroup = this.detectColorGroup(originalName, "", false);
      if (!colorGroup) {
        if (/\bgr[ae]y\s+joggers?\b/i.test(productNameClean)) colorGroup = "Darker Colors";
        else colorGroup = "Black";
      }
      let sizeSub = memMatch?.sweatSize || "3 in";
      if (sweatInchesDetected === "2.5" || /\bwomen'?s?\s+sweat/i.test(productNameClean) || /\b(shadow|sage)\s+(?:women'?s?\s+)?sweat/i.test(productNameClean)) {
        sizeSub = "2.5 in";
      } else if (sweatInchesDetected === "3") {
        sizeSub = "3 in";
      }
      return {
        effectiveRole,
        category: "Bottom Wear DTF",
        targetFolder: `Bottom Wear DTF/${colorGroup}/Sweatpants - Sweat Shorts/${sizeSub}`,
        sharedAdultKidsFolders: null,
        isSticker: false,
        isStickerMockup: false,
        isZipUp: false,
        needsReview: false,
        reviewType: null,
        autoExcluded: false,
        warnings: []
      };
    }

    if (isShortsOrBottomWear) {
      let colorGroup = this.detectColorGroup(originalName, "", false);
      if (!colorGroup) {
        if (/\ball\s*black\b|\bblack\b|\bmuay\s*thai\b/i.test(productNameClean)) colorGroup = "Black";
        else if (/\bwhite\b/i.test(productNameClean)) colorGroup = "Light Colors";
        else colorGroup = "Black";
      }
      if (colorGroup === "Darker Colors") {
        colorGroup = "Black";
        needsReview = true;
        reviewType = "DARKER_SHORTS_FORBIDDEN";
        warnings.push("Darker Colors não possui subpasta Shorts! Selecionado Black.");
      }

      const explicitAge = this.detectAgeGroup(productNameClean);
      let resolvedAge = "Adult";
      if (shortsInchesDetected === "CONFLICT_SIZES") {
        needsReview = true;
        reviewType = "SHORTS_INCONSISTENCY";
        warnings.push("Inconsistência: 5.5 e 4.5 Inches juntos.");
      } else if (shortsInchesDetected === "5.5") {
        resolvedAge = "Adult";
        if (explicitAge === "Kids" || explicitAge === "BOTH_CONFLICT") {
          needsReview = true;
          reviewType = "SHORTS_INCONSISTENCY";
          warnings.push("Inconsistência: 5.5 Inches e Kids!");
        }
      } else if (shortsInchesDetected === "4.5") {
        resolvedAge = "Kids";
        if (explicitAge === "Adult" || explicitAge === "BOTH_CONFLICT") {
          needsReview = true;
          reviewType = "SHORTS_INCONSISTENCY";
          warnings.push("Inconsistência: 4.5 Inches e Adult!");
        }
      } else if (explicitAge === "Adult" || explicitAge === "Kids") {
        resolvedAge = explicitAge;
      } else if (!isMockupFile || !config.shareMockupsAdultKids) {
        needsReview = true;
        reviewType = "SHORTS_AMBIGUOUS";
        warnings.push("Shorts sem tamanho e sem faixa etária.");
      }

      const canShare = isMockupFile && !needsReview && !shortsInchesDetected && config.shareMockupsAdultKids;
      return {
        effectiveRole,
        category: "Bottom Wear DTF",
        targetFolder: `Bottom Wear DTF/${colorGroup}/Shorts/${resolvedAge}`,
        sharedAdultKidsFolders: canShare ? [`Bottom Wear DTF/${colorGroup}/Shorts/Adult`, `Bottom Wear DTF/${colorGroup}/Shorts/Kids`] : null,
        isSticker: false,
        isStickerMockup: false,
        isZipUp: false,
        needsReview,
        reviewType,
        autoExcluded: false,
        warnings
      };
    }

    // Topwear DTF
    const isTopwearKeyword = /\b(topwear|dtf|basketball\s*jersey|jersey|tank\s*top|crewneck|sweatshirt|cropped|oversized|t-shirt|tshirt|tee|shirt|hoodie|zip\s*ups?|zip-ups?|zipups?|sherpa|varsity|sweater|camiseta|moletom|pocket)\b/i.test(productNameClean);
    const mentionsZipUpGarment = /\b(zip\s*ups?|zip-ups?|zipups?|sherpa\s+zip\s*up|varsity\s+zip\s*up)\b/i.test(productNameClean);
    const isSeparatedZipUp = this.isSeparatedZipUpFile(originalName, relativePath, config);

    if (isTopwearKeyword || isSeparatedZipUp) {
      const explicitAge = this.detectAgeGroup(productNameClean);
      const isCroppedPiece = /\bcropped\b/i.test(productNameClean);
      let age = "Adult";
      if (explicitAge === "Kids" || isCroppedPiece) age = "Kids";
      else if (explicitAge === "Adult") age = "Adult";
      else if (!isMockupFile) {
        needsReview = true;
        reviewType = "AGE_MISSING";
        warnings.push("Faixa etária não explícita no Final File de Topwear DTF.");
      }

      if (isSeparatedZipUp) {
        let colorGroup = this.detectColorGroup(originalName, "", false);
        if (/\bwhite\b/i.test(productNameClean)) {
          needsReview = true;
          reviewType = "ZIPUP_WHITE_FORBIDDEN";
          warnings.push("Não existe pasta White para Zip Ups. Realocado para Light Colors.");
          colorGroup = "Light Colors";
        }
        if (!colorGroup) colorGroup = "Black";
        return {
          effectiveRole,
          category: "Topwear DTF (Zip Up)",
          targetFolder: `Topwear DTF/${zipPrefix}/${colorGroup}/${age}`,
          sharedAdultKidsFolders: isMockupFile ? [`Topwear DTF/${zipPrefix}/${colorGroup}/Adult`, `Topwear DTF/${zipPrefix}/${colorGroup}/Kids`] : null,
          isSticker: false,
          isStickerMockup: false,
          isZipUp: true,
          needsReview,
          reviewType,
          autoExcluded: false,
          warnings
        };
      }

      const colorGroup = this.detectColorGroup(originalName, "", !mentionsZipUpGarment) || "Black";
      const isGenericBlackHoodieMockup = isMockupFile && colorGroup === "Black" && /\bblack\s+hoodie\s+mockup\b/i.test(productNameClean) && !explicitAge && config.shareMockupsAdultKids;
      const isPocketModeZipUpMockup = isMockupFile && mentionsZipUpGarment && config.topwearType !== "Centered";
      const shouldShare = isGenericBlackHoodieMockup || isPocketModeZipUpMockup;

      return {
        effectiveRole,
        category: "Topwear DTF",
        targetFolder: `Topwear DTF/${mainPrefix}/${colorGroup}/${age}`,
        sharedAdultKidsFolders: shouldShare ? [`Topwear DTF/${mainPrefix}/${colorGroup}/Adult`, `Topwear DTF/${mainPrefix}/${colorGroup}/Kids`] : null,
        isSticker: false,
        isStickerMockup: false,
        isZipUp: false,
        needsReview,
        reviewType,
        autoExcluded: false,
        warnings
      };
    }

    return {
      effectiveRole,
      category: "Revisão Manual Necessária",
      targetFolder: `Topwear DTF/${mainPrefix}/Black/Adult`,
      sharedAdultKidsFolders: null,
      isSticker: false,
      isStickerMockup: false,
      isZipUp: false,
      needsReview: true,
      reviewType: "UNKNOWN_CATEGORY",
      autoExcluded: false,
      warnings: ["Categoria não identificada."]
    };
  }
};
