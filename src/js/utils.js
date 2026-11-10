/**
 * Break Point — Utilitários Binários (CRC32) & Inspeção Visual de Imagem
 */

const BinaryUtils = {
  crcTable: (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    return table;
  })(),

  crc32(uint8Arr) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < uint8Arr.length; i++) {
      crc = (crc >>> 8) ^ this.crcTable[(crc ^ uint8Arr[i]) & 0xFF];
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }
};

const VisualImageInspector = {
  createFallbackPreviewDataUrl(fileName, sourceRole) {
    const clean = fileName.split("/").pop();
    const isFinal = /final\s*file/i.test(clean) || sourceRole === "Final File";
    const bg = isFinal ? "#17181c" : "#f2ece1";
    const accent = isFinal ? "#d49b27" : "#17181c";
    const textFill = isFinal ? "#faf7f1" : "#17181c";
    const shortTitle = clean.slice(0, 30).replace(/[<>&"]/g, "");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180" viewBox="0 0 240 180">
      <rect width="240" height="180" rx="12" fill="${bg}" stroke="${accent}" stroke-width="3"/>
      <text x="120" y="45" text-anchor="middle" fill="${accent}" font-family="monospace" font-weight="bold" font-size="13">${isFinal ? "FINAL FILE" : "MOCKUP"}</text>
      <text x="120" y="95" text-anchor="middle" fill="${textFill}" font-family="sans-serif" font-weight="bold" font-size="14">BREAK POINT</text>
      <text x="120" y="145" text-anchor="middle" fill="${textFill}" font-family="monospace" font-size="10">${shortTitle}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  },

  /**
   * Verifica se os bytes da imagem possuem fundo transparente (canal alfa com transparência significativa).
   * Final Files (arquivos de impressão DTF/Sublimação) sempre possuem fundo transparente.
   */
  async hasTransparentBackground(bytes, fileName = "") {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    // JPG/JPEG não suportam transparência -> nunca têm fundo transparente (são Mockups)
    if (ext === "jpg" || ext === "jpeg") return false;
    if (!["png", "webp"].includes(ext) || !bytes || bytes.length <= 64) return false;

    try {
      const blob = new Blob([bytes], { type: ext === "webp" ? "image/webp" : "image/png" });
      if (typeof createImageBitmap === "function") {
        const bitmap = await createImageBitmap(blob);
        const w = Math.min(bitmap.width, 64);
        const h = Math.min(bitmap.height, 64);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0, w, h);
        if (typeof bitmap.close === "function") bitmap.close();

        const data = ctx.getImageData(0, 0, w, h).data;
        let transparentPixels = 0;
        let cornerTransparent = 0;
        const totalPixels = w * h;

        // Checa os 4 cantos da imagem
        const cornerIndices = [
          0,
          (w - 1) * 4,
          (h - 1) * w * 4,
          ((h - 1) * w + (w - 1)) * 4
        ];
        for (const idx of cornerIndices) {
          if (data[idx + 3] < 200) cornerTransparent++;
        }

        for (let i = 3; i < data.length; i += 4) {
          if (data[i] < 200) transparentPixels++;
        }

        const transparentRatio = transparentPixels / Math.max(totalPixels, 1);
        return cornerTransparent >= 2 && transparentRatio >= 0.08;
      }
    } catch (e) {
      // Fallback silencioso caso não consiga decodificar
    }
    return false;
  },

  async inspectImageBytes(bytes, fileName, sourceRole = "Mockup") {
    const ext = (fileName.split(".").pop() || "").toLowerCase();
    const memMatch = VisualMemoryEngine.queryMemory(fileName);
    if (!["png", "jpg", "jpeg", "webp"].includes(ext) || bytes.length <= 64) {
      return {
        isImage: false,
        nonTransparentRatio: 0.5,
        thumbUrl: this.createFallbackPreviewDataUrl(fileName, sourceRole),
        memoryHit: memMatch
      };
    }
    try {
      const blob = new Blob([bytes], { type: ext === "png" ? "image/png" : "image/jpeg" });
      return {
        isImage: true,
        nonTransparentRatio: 0.5,
        thumbUrl: URL.createObjectURL(blob),
        memoryHit: memMatch
      };
    } catch (e) {
      return {
        isImage: false,
        nonTransparentRatio: 0.5,
        thumbUrl: this.createFallbackPreviewDataUrl(fileName, sourceRole),
        memoryHit: memMatch
      };
    }
  }
};
