/**
 * Break Point — Memória Visual IA & Configuração Oficial de Pastas e Cores
 */

const VisualMemoryEngine = {
  storageKey: "BREAKPOINT_VISUAL_IMAGE_MEMORY_V13",

  builtInVisualRules: [
    { exactOrSingularPattern: /\bshadow\s+women'?s?\s+sweat\s*pants?\b/i, colorGroup: "Darker Colors", category: "Bottom Wear DTF", sweatSize: "2.5 in", neverExclude: true },
    { exactOrSingularPattern: /\bshadow\s+women'?s?\s+sweat\s*shorts?\b/i, colorGroup: "Darker Colors", category: "Bottom Wear DTF", sweatSize: "2.5 in", neverExclude: true },
    { exactOrSingularPattern: /\bsage\s+women'?s?\s+sweat\s*shorts?\b/i, colorGroup: "Light Colors", category: "Bottom Wear DTF", sweatSize: "2.5 in", neverExclude: true },
    { exactOrSingularPattern: /\bsage\s+women'?s?\s+sweat\s*pants?\b/i, colorGroup: "Light Colors", category: "Bottom Wear DTF", sweatSize: "2.5 in", neverExclude: true },
    { exactOrSingularPattern: /\bgraybronze\s+crossbody\s+bag\s+mockup\b/i, colorGroup: "Black", category: "Bags", bagSize: "4 Inches", neverExclude: true },
    { exactOrSingularPattern: /\bblack\s+crossbody\s+bag\s+mockup\b/i, colorGroup: "Black", category: "Bags", bagSize: "4 Inches", neverExclude: true },
    { exactOrSingularPattern: /\ball\s+black\b.*\brash\s*guards?\b/i, colorGroup: "Black", category: "All Black", replicateAdultKids: true, neverExclude: true },
    { exactOrSingularPattern: /\bespresso\s+cvc\s+next\s+level\s+shirt\s+mockup\b/i, colorGroup: "Darker Colors", category: "Topwear DTF", neverExclude: true },
    { exactOrSingularPattern: /\bperforated\s+white\s+hat\s+side\s+mockup\b/i, colorGroup: null, category: "Hats and Beanies", neverExclude: true },
    { exactOrSingularPattern: /\bsherpa\s+zip\s*up\s+hoodie\s+mockup\b/i, colorGroup: "Darker Colors", category: "Topwear DTF (Zip Up)", replicateAdultKids: true, neverExclude: true },
    { exactOrSingularPattern: /\bblack\s+camo\s+kids\s+hoodie\s+mockup\b/i, colorGroup: "Darker Colors", category: "Topwear DTF", replicateAdultKids: false, neverExclude: true },
    { exactOrSingularPattern: /^rash\s*guards?\s+mockups?(?:\s*\(rectangle\))?$/i, colorGroup: null, category: "No Gi", replicateAdultKids: true, neverExclude: true }
  ],

  getCustomMemory() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  saveCustomRule(garmentSignature, colorGroup, targetFolderTemplate, neverExclude = true) {
    try {
      const mem = this.getCustomMemory();
      const key = garmentSignature.toLowerCase();
      mem[key] = {
        ...(mem[key] || {}),
        colorGroup: colorGroup || mem[key]?.colorGroup || null,
        targetFolderTemplate: targetFolderTemplate || mem[key]?.targetFolderTemplate || null,
        neverExclude: neverExclude !== undefined ? neverExclude : true,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(mem));
    } catch (e) {}
  },

  extractGarmentSignature(fileName) {
    let clean = fileName.split("/").pop().replace(/\.[^.]+$/, "");
    clean = clean.replace(/^#\d+\s+[A-Za-z0-9]+\s+/, "");
    clean = clean.split(/\s+-\s+/)[0].trim();
    return clean.toLowerCase();
  },

  queryMemory(fileName) {
    const sig = this.extractGarmentSignature(fileName);
    const custom = this.getCustomMemory();
    if (custom[sig]) {
      return {
        source: "CustomUserMemory",
        colorGroup: custom[sig].colorGroup,
        targetFolderTemplate: custom[sig].targetFolderTemplate,
        neverExclude: custom[sig].neverExclude !== false
      };
    }
    for (const rule of this.builtInVisualRules) {
      if (rule.exactOrSingularPattern.test(sig)) {
        return {
          source: "BuiltInVisualMemory",
          colorGroup: rule.colorGroup,
          category: rule.category,
          bagSize: rule.bagSize || null,
          sweatSize: rule.sweatSize || null,
          replicateAdultKids: rule.replicateAdultKids,
          neverExclude: rule.neverExclude !== false
        };
      }
    }
    return null;
  }
};

const BreakPointConfig = {
  stickerNumbers: ["10", "8", "6", "4", "3", "2"],
  stickerSizes: ["10 inches", "8 inches", "6 inches", "4 inches", "3 inches", "2 inches"],

  lightColorsKeywords: [
    "light colors dtf", "light color", "light colors",
    "arona", "cream", "dry fit gold", "gold", "dry fit silver", "silver",
    "heather columbia blue", "columbia blue", "baby blue", "sky blue", "light blue",
    "heather gray", "heather grey", "heather mauve", "mauve", "light gray", "light grey",
    "bubblegum pink", "pink", "red", "sandstone", "tan", "mint", "sage",
    "yellow", "sand", "beige", "lavender", "peach"
  ],

  darkerColorsKeywords: [
    "darker colors dtf", "darker color", "darker colors", "dark color",
    "sherpa", "shadow", "black camo", "asphalt", "espresso", "heather heavy metal", "heavy metal",
    "midnight navy", "navy", "military green", "royal blue", "royal heather",
    "charcoal", "dry fit gray", "dry fit grey", "brown",
    "maroon", "burgundy", "forest green", "olive", "dark green", "purple"
  ],

  getStandardFolders(designNumber, designLetter, topwearType, zipUpLetter) {
    const mainPrefix = `#${designNumber} ${designLetter}`;
    const folders = [
      "All Black/Rashguards/Adult",
      "All Black/Rashguards/Kids",
      "Bags/Black/4 Inches",
      "Bags/Black/6 Inches",
      "Bags/Black/8 Inches",
      "Bags/Black/10 Inches",
      "Bottom Wear DTF/Black/Shorts/Adult",
      "Bottom Wear DTF/Black/Shorts/Kids",
      "Bottom Wear DTF/Black/Sweatpants - Sweat Shorts/2.5 in",
      "Bottom Wear DTF/Black/Sweatpants - Sweat Shorts/3 in",
      "Bottom Wear DTF/Darker Colors/Sweatpants - Sweat Shorts/2.5 in",
      "Bottom Wear DTF/Darker Colors/Sweatpants - Sweat Shorts/3 in",
      "Bottom Wear DTF/Light Colors/Shorts/Adult",
      "Bottom Wear DTF/Light Colors/Shorts/Kids",
      "Bottom Wear DTF/Light Colors/Sweatpants - Sweat Shorts/2.5 in",
      "Bottom Wear DTF/Light Colors/Sweatpants - Sweat Shorts/3 in",
      "Colored RashGuard/Adult",
      "Colored RashGuard/Kids",
      "Hats and Beanies",
      "No Gi/Rashguards/Adult",
      "No Gi/Rashguards/Kids",
      "Stickers",
      `Topwear DTF/${mainPrefix}/Black/Adult`,
      `Topwear DTF/${mainPrefix}/Black/Kids`,
      `Topwear DTF/${mainPrefix}/Darker Colors/Adult`,
      `Topwear DTF/${mainPrefix}/Darker Colors/Kids`,
      `Topwear DTF/${mainPrefix}/Light Colors/Adult`,
      `Topwear DTF/${mainPrefix}/Light Colors/Kids`,
      `Topwear DTF/${mainPrefix}/White/Adult`,
      `Topwear DTF/${mainPrefix}/White/Kids`
    ];

    if (topwearType === "Centered" && zipUpLetter && zipUpLetter.trim() !== "") {
      const zipPrefix = `#${designNumber} ${zipUpLetter.trim().toUpperCase()}`;
      folders.push(
        `Topwear DTF/${zipPrefix}/Black/Adult`,
        `Topwear DTF/${zipPrefix}/Black/Kids`,
        `Topwear DTF/${zipPrefix}/Darker Colors/Adult`,
        `Topwear DTF/${zipPrefix}/Darker Colors/Kids`,
        `Topwear DTF/${zipPrefix}/Light Colors/Adult`,
        `Topwear DTF/${zipPrefix}/Light Colors/Kids`
      );
    }
    return folders;
  }
};
