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
