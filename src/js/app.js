/**
 * Break Point — Estado da Aplicação e Controlador de Interface (UI)
 */

window.currentActiveTab = "workflow";

window.syncHeaderBadgesImmediate = function () {
  const isMystore = window.currentActiveTab === "mystore";
  const numEl = document.getElementById(isMystore ? "mystoreNewNumber" : "inputDesignNumber");
  const letEl = document.getElementById(isMystore ? "mystoreNewLetter" : "inputDesignLetter");
  const typeEl = document.getElementById(isMystore ? "mystoreSelectTopwearType" : "selectTopwearType");
  const zipEl = document.getElementById(isMystore ? "mystoreZipUpLetter" : "inputZipUpLetter");

  if (!numEl || !letEl || !typeEl || !zipEl) return;

  const rawNum = numEl.value.trim();
  const rawLet = letEl.value.trim().toUpperCase();
  const topType = typeEl.value;
  const rawZipLet = zipEl.value.trim().toUpperCase();

  const displayNum = rawNum || "---";
  const displayLet = rawLet || "-";
  const displayZipLet = rawZipLet || "-";

  const mainBadge = document.getElementById("previewPrefixBadge");
  const zipBadge = document.getElementById("previewZipUpBadge");
  const zipText = document.getElementById("previewZipUpText");

  const setupZipContainer = document.getElementById("containerZipUpLetter");
  const mystoreZipContainer = document.getElementById("mystoreContainerZipUpLetter");

  if (mainBadge) mainBadge.textContent = `#${displayNum} ${displayLet}`;

  const setupTypeEl = document.getElementById("selectTopwearType");
  if (setupTypeEl && setupZipContainer) {
    setupZipContainer.classList.toggle("hidden", setupTypeEl.value !== "Centered");
  }

  const mystoreTypeEl = document.getElementById("mystoreSelectTopwearType");
  if (mystoreTypeEl && mystoreZipContainer) {
    mystoreZipContainer.classList.toggle("hidden", mystoreTypeEl.value !== "Centered");
  }

  if (topType === "Centered") {
    if (zipBadge) zipBadge.classList.remove("hidden");
    if (zipText) zipText.textContent = `#${displayNum} ${displayZipLet}`;
  } else {
    if (zipBadge) zipBadge.classList.add("hidden");
  }
};

const AppState = {
  mockupFile: null,
  finalFile: null,
  extraZipFiles: [],
  rawEntriesCache: [],
  processingQueue: [],
  lastExportResult: null,
  activeModalItemId: null,
  mystoreOldZip: null,
  mystoreNewMockupsZip: null,
  mystoreExportBlob: null,

  getConfig() {
    return {
      designNumber: document.getElementById("inputDesignNumber").value.trim() || "980",
      designLetter: (document.getElementById("inputDesignLetter").value.trim() || "L").toUpperCase(),
      topwearType: document.getElementById("selectTopwearType").value,
      zipUpLetter: (document.getElementById("inputZipUpLetter").value.trim() || "B").toUpperCase(),
      defaultAcademy: document.getElementById("inputDefaultAcademy").value.trim(),
      onlyCreateActiveFolders: true,
      autoRemoveThumbnailsAndPatches: true,
      shareMockupsAdultKids: true,
      enableVisualAI: true
    };
  }
};

const UIController = {
  init() {
    this.bindEvents();
    window.syncHeaderBadgesImmediate();
  },

  async assignMultipleZipsAndAnalyze(fileList) {
    const files = Array.from(fileList || []).filter(f => f.name.toLowerCase().endsWith(".zip") || f.type.includes("zip"));
    if (files.length === 0) return alert("Por favor, selecione arquivos no formato .ZIP.");

    AppState.extraZipFiles = [];
    if (files.length === 1) {
      if (/final/i.test(files[0].name) && !/mockup/i.test(files[0].name)) AppState.finalFile = files[0];
      else AppState.mockupFile = files[0];
    } else {
      AppState.mockupFile = null;
      AppState.finalFile = null;
      const remaining = [];
      for (const f of files) {
        const lower = f.name.toLowerCase();
        if (!AppState.mockupFile && lower.includes("mockup")) AppState.mockupFile = f;
        else if (!AppState.finalFile && lower.includes("final")) AppState.finalFile = f;
        else remaining.push(f);
      }
      for (const rem of remaining) {
        if (!AppState.mockupFile) AppState.mockupFile = rem;
        else if (!AppState.finalFile) AppState.finalFile = rem;
        else AppState.extraZipFiles.push(rem);
      }
    }

    document.getElementById("statusMockupZip").textContent = AppState.mockupFile ? `✓ ${AppState.mockupFile.name}` : "Nenhum arquivo selecionado";
    document.getElementById("statusFinalZip").textContent = AppState.finalFile ? `✓ ${AppState.finalFile.name}` : "Nenhum arquivo selecionado";
    document.getElementById("badgeBothZipsStatus").classList.remove("hidden");
    await this.handleAnalyze();
  },

  assignMultipleMystoreZips(fileList) {
    const files = Array.from(fileList || []).filter(f => f.name.toLowerCase().endsWith(".zip") || f.type.includes("zip"));
    if (files.length === 0) return alert("Por favor, selecione arquivos no formato .ZIP.");

    if (files.length === 1) {
      if (/mockup/i.test(files[0].name)) AppState.mystoreNewMockupsZip = files[0];
      else AppState.mystoreOldZip = files[0];
    } else {
      AppState.mystoreOldZip = null;
      AppState.mystoreNewMockupsZip = null;
      const remaining = [];
      for (const f of files) {
        const lower = f.name.toLowerCase();
        if (!AppState.mystoreNewMockupsZip && lower.includes("mockup")) {
          AppState.mystoreNewMockupsZip = f;
        } else {
          remaining.push(f);
        }
      }
      for (const rem of remaining) {
        if (!AppState.mystoreOldZip) AppState.mystoreOldZip = rem;
        else if (!AppState.mystoreNewMockupsZip) AppState.mystoreNewMockupsZip = rem;
      }
    }

    document.getElementById("mystoreStatusOldZip").textContent = AppState.mystoreOldZip ? `✓ ${AppState.mystoreOldZip.name}` : "Nenhum arquivo selecionado";
    document.getElementById("mystoreStatusNewMockupsZip").textContent = AppState.mystoreNewMockupsZip ? `✓ ${AppState.mystoreNewMockupsZip.name}` : "Nenhum arquivo selecionado";
    const badge = document.getElementById("mystoreBadgeBothStatus");
    badge.classList.remove("hidden");
    badge.textContent = `✓ ${files.length} ZIP(s) Carregado(s)`;
  },

  bindEvents() {
    document.getElementById("btnTabWorkflow").addEventListener("click", () => this.switchTab("workflow"));
    document.getElementById("btnTabMystore").addEventListener("click", () => this.switchTab("mystore"));

    ["inputDesignNumber", "inputDesignLetter", "selectTopwearType", "inputZipUpLetter"].forEach((id) => {
      const el = document.getElementById(id);
      const onUpdate = () => {
        window.syncHeaderBadgesImmediate();
        if (AppState.rawEntriesCache.length > 0) {
          AppState.processingQueue = ZipProcessor.buildProcessingQueue(AppState.rawEntriesCache, AppState.getConfig());
          this.refreshAllPreviewViews();
        }
      };
      el.addEventListener("input", onUpdate);
      el.addEventListener("change", onUpdate);
    });

    const fileBothInput = document.getElementById("fileBothZips");
    document.getElementById("btnSelectBothZips").addEventListener("click", () => {
      fileBothInput.value = "";
      fileBothInput.click();
    });
    fileBothInput.addEventListener("change", (e) => {
      if (e.target.files?.length > 0) this.assignMultipleZipsAndAnalyze(e.target.files);
    });

    const dropzoneBoth = document.getElementById("dropzoneBothZips");
    dropzoneBoth.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzoneBoth.classList.add("border-[#f3be4f]");
    });
    dropzoneBoth.addEventListener("dragleave", () => dropzoneBoth.classList.remove("border-[#f3be4f]"));
    dropzoneBoth.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzoneBoth.classList.remove("border-[#f3be4f]");
      if (e.dataTransfer?.files?.length > 0) this.assignMultipleZipsAndAnalyze(e.dataTransfer.files);
    });

    document.getElementById("fileMockupZip").addEventListener("change", (e) => {
      AppState.mockupFile = e.target.files[0] || null;
      document.getElementById("statusMockupZip").textContent = AppState.mockupFile ? `✓ ${AppState.mockupFile.name}` : "Nenhum arquivo selecionado";
    });
    document.getElementById("fileFinalZip").addEventListener("change", (e) => {
      AppState.finalFile = e.target.files[0] || null;
      document.getElementById("statusFinalZip").textContent = AppState.finalFile ? `✓ ${AppState.finalFile.name}` : "Nenhum arquivo selecionado";
    });

    document.getElementById("btnAnalyze").addEventListener("click", () => this.handleAnalyze());
    document.getElementById("btnCancelOp").addEventListener("click", () => { ZipProcessor.cancelRequested = true; });
    document.getElementById("btnResetAll").addEventListener("click", () => this.handleReset());
    document.getElementById("btnConfirmProcess").addEventListener("click", () => this.handleConfirmExport());
    document.getElementById("btnDownloadUnifiedZip").addEventListener("click", () => this.triggerBlobDownload());

    document.getElementById("btnRestoreAllExcluded").addEventListener("click", () => {
      const excludedItems = AppState.processingQueue.filter((i) => i.autoExcluded && !ExclusionFilterEngine.isGiOrBeltPatch(i.originalName, i.relativePath));
      for (const it of excludedItems) this.restoreAndLearnExcludedItem(it);
      this.refreshAllPreviewViews();
    });

    document.getElementById("inputSearchTable").addEventListener("input", () => this.renderPreviewTable());
    document.getElementById("selectFilterStatus").addEventListener("change", () => this.renderPreviewTable());
    document.getElementById("chkShowEmptyFolders").addEventListener("change", () => this.renderUnifiedFolderTree());

    // Eventos do Módulo MY STORE
    const mystoreBothInput = document.getElementById("mystoreFileBothZips");
    document.getElementById("btnMystoreSelectBoth").addEventListener("click", () => {
      mystoreBothInput.value = "";
      mystoreBothInput.click();
    });
    mystoreBothInput.addEventListener("change", (e) => {
      if (e.target.files?.length > 0) this.assignMultipleMystoreZips(e.target.files);
    });

    const mystoreDrop = document.getElementById("mystoreDropzoneBoth");
    mystoreDrop.addEventListener("dragover", (e) => {
      e.preventDefault();
      mystoreDrop.classList.add("border-[#f3be4f]");
    });
    mystoreDrop.addEventListener("dragleave", () => mystoreDrop.classList.remove("border-[#f3be4f]"));
    mystoreDrop.addEventListener("drop", (e) => {
      e.preventDefault();
      mystoreDrop.classList.remove("border-[#f3be4f]");
      if (e.dataTransfer?.files?.length > 0) this.assignMultipleMystoreZips(e.dataTransfer.files);
    });

    document.getElementById("mystoreFileOldZip").addEventListener("change", (e) => {
      AppState.mystoreOldZip = e.target.files[0] || null;
      document.getElementById("mystoreStatusOldZip").textContent = AppState.mystoreOldZip ? `✓ ${AppState.mystoreOldZip.name}` : "Nenhum arquivo selecionado";
    });
    document.getElementById("mystoreFileNewMockupsZip").addEventListener("change", (e) => {
      AppState.mystoreNewMockupsZip = e.target.files[0] || null;
      document.getElementById("mystoreStatusNewMockupsZip").textContent = AppState.mystoreNewMockupsZip ? `✓ ${AppState.mystoreNewMockupsZip.name}` : "Nenhum arquivo selecionado";
    });
    document.getElementById("btnMystoreProcess").addEventListener("click", () => this.handleMyStoreProcess());
    document.getElementById("btnMystoreReset").addEventListener("click", () => this.handleMystoreReset());

    document.getElementById("btnMystoreDownload").addEventListener("click", () => {
      if (!AppState.mystoreExportBlob) return;
      const num = document.getElementById("mystoreNewNumber").value.trim() || "980";
      const lettr = (document.getElementById("mystoreNewLetter").value.trim() || "L").toUpperCase();
      const url = URL.createObjectURL(AppState.mystoreExportBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MyStore_#${num}_${lettr}_Atualizado.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    document.getElementById("btnCloseModal").addEventListener("click", () => this.closeImageModal());
    document.getElementById("btnModalSave").addEventListener("click", () => this.saveModalChanges());
    document.getElementById("imagePreviewModal").addEventListener("click", (e) => {
      if (e.target.id === "imagePreviewModal") this.closeImageModal();
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeImageModal();
    });
  },

  switchTab(tab) {
    window.currentActiveTab = tab;
    const isSetup = tab === "workflow";
    document.getElementById("viewWorkflow").classList.toggle("hidden", !isSetup);
    document.getElementById("viewMystore").classList.toggle("hidden", isSetup);

    const btnSetup = document.getElementById("btnTabWorkflow");
    const btnMystore = document.getElementById("btnTabMystore");

    if (isSetup) {
      btnSetup.className = "px-4 py-2 rounded-lg bg-[#17181c] text-[#faf7f1] text-xs font-black uppercase tracking-wider transition shadow-sm border-2 border-[#17181c] cursor-pointer";
      btnMystore.className = "px-4 py-2 rounded-lg bg-[#f2ece1] hover:bg-[#e5dec9] text-[#4a463d] text-xs font-black uppercase tracking-wider transition border-2 border-[#cfc6b4] cursor-pointer";
    } else {
      btnMystore.className = "px-4 py-2 rounded-lg bg-[#17181c] text-[#faf7f1] text-xs font-black uppercase tracking-wider transition shadow-sm border-2 border-[#17181c] cursor-pointer";
      btnSetup.className = "px-4 py-2 rounded-lg bg-[#f2ece1] hover:bg-[#e5dec9] text-[#4a463d] text-xs font-black uppercase tracking-wider transition border-2 border-[#cfc6b4] cursor-pointer";
    }
    window.syncHeaderBadgesImmediate();
  },

  async handleMyStoreProcess() {
    if (!AppState.mystoreOldZip || !AppState.mystoreNewMockupsZip) {
      alert("Por favor, selecione tanto o ZIP 1 (Pasta Pronta do Cliente) quanto o ZIP 2 (Novos Mockups).");
      return;
    }
    const newNum = document.getElementById("mystoreNewNumber").value.trim();
    const newLet = document.getElementById("mystoreNewLetter").value.trim().toUpperCase();
    const topwearType = document.getElementById("mystoreSelectTopwearType").value;
    const zipUpLetter = (document.getElementById("mystoreZipUpLetter").value.trim() || "B").toUpperCase();
    const oldPrefix = document.getElementById("mystoreOldPrefix").value.trim();
    const replaceMode = document.getElementById("mystoreReplaceMode").value;

    if (!newNum || !newLet) {
      alert("Por favor, preencha o Novo Customer / Design # e a Nova Design Letter.");
      return;
    }

    try {
      const res = await MyStoreEngine.processMyStore(AppState.mystoreOldZip, AppState.mystoreNewMockupsZip, {
        oldPrefix,
        newNumber: newNum,
        newLetter: newLet,
        topwearType,
        zipUpLetter,
        replaceMode
      });

      AppState.mystoreExportBlob = res.blob;
      document.getElementById("mystoreResultSection").classList.remove("hidden");
      document.getElementById("mystoreSummaryCards").innerHTML = `
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[10px] font-bold uppercase text-[#4a463d]">Final Files Mantidos</div><div class="text-2xl font-black text-[#15603e]">${res.stats.keptFinalFilesCount}</div></div>
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[10px] font-bold uppercase text-[#4a463d]">Mockups Antigos Deletados</div><div class="text-2xl font-black text-[#bf2626]">${res.stats.deletedOldMockupsCount}</div></div>
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[10px] font-bold uppercase text-[#4a463d]">Mockups Padrão Mantidos</div><div class="text-2xl font-black text-[#b45309]">${res.stats.keptExistingMockupsCount}</div></div>
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[10px] font-bold uppercase text-[#4a463d]">Novos Mockups Inseridos</div><div class="text-2xl font-black text-[#1e40af]">${res.stats.addedNewMockupsCount}</div></div>
      `;
      document.getElementById("mystoreLogContainer").innerHTML = res.logs.map(l => `<div>${l}</div>`).join("");
      document.getElementById("mystoreResultSection").scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      alert(`Erro no processamento da My Store: ${err.message}`);
    }
  },

  handleMystoreReset() {
    AppState.mystoreOldZip = null;
    AppState.mystoreNewMockupsZip = null;
    AppState.mystoreExportBlob = null;
    document.getElementById("mystoreOldPrefix").value = "";
    document.getElementById("mystoreNewNumber").value = "";
    document.getElementById("mystoreNewLetter").value = "";
    document.getElementById("mystoreZipUpLetter").value = "";
    document.getElementById("mystoreFileOldZip").value = "";
    document.getElementById("mystoreFileNewMockupsZip").value = "";
    document.getElementById("mystoreFileBothZips").value = "";
    document.getElementById("mystoreBadgeBothStatus").classList.add("hidden");
    document.getElementById("mystoreStatusOldZip").textContent = "Nenhum arquivo selecionado";
    document.getElementById("mystoreStatusNewMockupsZip").textContent = "Nenhum arquivo selecionado";
    document.getElementById("mystoreResultSection").classList.add("hidden");
    window.syncHeaderBadgesImmediate();
  },

  restoreAndLearnExcludedItem(item) {
    const cfg = AppState.getConfig();
    const sig = VisualMemoryEngine.extractGarmentSignature(item.originalName);
    VisualMemoryEngine.saveCustomRule(sig, null, null, true);

    const reclass = CategoryClassifier.classifyFile(item.originalName, item.relativePath || "", cfg, item.sourceRole, item.visualInfo, true);
    const activeLetter = (cfg.topwearType === "Centered" && reclass.isZipUp) ? (cfg.zipUpLetter || "B").toUpperCase() : cfg.designLetter.toUpperCase();
    const renameRes = RenamingEngine.renameStandardFile(item.originalName, cfg.designNumber, activeLetter);

    item.autoExcluded = false;
    item.included = true;
    item.finalName = renameRes.finalName;
    item.category = reclass.category;
    item.targetFolder = reclass.targetFolder;
    item.isZipUp = reclass.isZipUp;
    item.needsReview = reclass.needsReview;
  },

  openImageModal(itemId) {
    const item = AppState.processingQueue.find((x) => x.id === itemId);
    if (!item) return;
    AppState.activeModalItemId = itemId;
    const cfg = AppState.getConfig();
    const availableFolders = BreakPointConfig.getStandardFolders(cfg.designNumber, cfg.designLetter, cfg.topwearType, cfg.zipUpLetter);
    const folderOptions = availableFolders.includes(item.targetFolder) ? availableFolders : [item.targetFolder, ...availableFolders];

    document.getElementById("modalItemRoleBadge").textContent = item.sourceRole.toUpperCase();
    document.getElementById("modalItemTitle").textContent = item.originalName;
    document.getElementById("modalInputFinalName").value = item.finalName;
    document.getElementById("modalSelectFolder").innerHTML = folderOptions.map(f => `<option value="${f}" ${f === item.targetFolder ? "selected" : ""}>${f}</option>`).join("");
    document.getElementById("modalVisualNoteText").textContent = (item.warnings && item.warnings.join(" | ")) || "Pronto para exportação.";

    const imgEl = document.getElementById("modalImageElement");
    const fallbackEl = document.getElementById("modalNoImageFallback");
    if (item.visualInfo && item.visualInfo.thumbUrl) {
      imgEl.src = item.visualInfo.thumbUrl;
      imgEl.classList.remove("hidden");
      fallbackEl.classList.add("hidden");
    } else {
      imgEl.classList.add("hidden");
      fallbackEl.classList.remove("hidden");
    }

    document.getElementById("imagePreviewModal").classList.remove("hidden");
    document.getElementById("imagePreviewModal").classList.add("flex");
  },

  closeImageModal() {
    document.getElementById("imagePreviewModal").classList.add("hidden");
    document.getElementById("imagePreviewModal").classList.remove("flex");
    AppState.activeModalItemId = null;
  },

  saveModalChanges() {
    if (!AppState.activeModalItemId) return;
    const item = AppState.processingQueue.find((x) => x.id === AppState.activeModalItemId);
    if (item) {
      const newName = document.getElementById("modalInputFinalName").value.trim();
      const newFolder = document.getElementById("modalSelectFolder").value;
      if (newName) item.finalName = newName;
      if (newFolder) {
        item.targetFolder = newFolder;
        item.needsReview = false;
        item.autoExcluded = false;
        item.included = true;
        const sig = VisualMemoryEngine.extractGarmentSignature(item.originalName);
        const colorMatch = newFolder.match(/\/(Black|Darker Colors|Light Colors|White)\//);
        VisualMemoryEngine.saveCustomRule(sig, colorMatch ? colorMatch[1] : null, newFolder, true);
      }
    }
    this.closeImageModal();
    this.refreshAllPreviewViews();
  },

  setProgress(visible, percent = 0, label = "") {
    const container = document.getElementById("progressContainer");
    const cancelBtn = document.getElementById("btnCancelOp");
    if (!visible) {
      container.classList.add("hidden");
      cancelBtn.classList.add("hidden");
      return;
    }
    container.classList.remove("hidden");
    cancelBtn.classList.remove("hidden");
    document.getElementById("progressBar").style.width = `${percent}%`;
    document.getElementById("progressPercent").textContent = `${percent}%`;
    document.getElementById("progressLabel").textContent = label;
  },

  async handleAnalyze() {
    if (!AppState.mockupFile && !AppState.finalFile && AppState.extraZipFiles.length === 0) {
      return alert("Selecione os arquivos ZIP.");
    }
    const numVal = document.getElementById("inputDesignNumber").value.trim();
    const letVal = document.getElementById("inputDesignLetter").value.trim();
    if (!numVal || !letVal) {
      return alert("Por favor, digite o Customer / Design # e a Design Letter antes de analisar.");
    }

    try {
      ZipProcessor.cancelRequested = false;
      document.getElementById("finalReportSection").classList.add("hidden");
      window.syncHeaderBadgesImmediate();
      const cfg = AppState.getConfig();
      const rawEntries = [];
      if (AppState.mockupFile) {
        const m = await ZipProcessor.extractZipEntries(AppState.mockupFile, "Mockup", cfg.enableVisualAI, (p, msg) => this.setProgress(true, Math.round(p * 0.45), msg));
        rawEntries.push(...m);
      }
      if (AppState.finalFile) {
        const f = await ZipProcessor.extractZipEntries(AppState.finalFile, "Final File", cfg.enableVisualAI, (p, msg) => this.setProgress(true, 50 + Math.round(p * 0.45), msg));
        rawEntries.push(...f);
      }
      for (const extraZip of AppState.extraZipFiles) {
        const roleGuess = /final/i.test(extraZip.name) ? "Final File" : "Mockup";
        const extraEntries = await ZipProcessor.extractZipEntries(extraZip, roleGuess, cfg.enableVisualAI);
        rawEntries.push(...extraEntries);
      }
      AppState.rawEntriesCache = rawEntries;
      AppState.processingQueue = ZipProcessor.buildProcessingQueue(rawEntries, cfg);
      this.setProgress(false);
      document.getElementById("previewSection").classList.remove("hidden");
      this.refreshAllPreviewViews();
    } catch (err) {
      this.setProgress(false);
      alert(`Erro: ${err.message}`);
    }
  },

  refreshAllPreviewViews() {
    this.renderMetrics();
    this.renderAttentionBox();
    this.renderRemovedFilesBox();
    this.renderUnifiedFolderTree();
    this.renderPreviewTable();
  },

  renderMetrics() {
    const active = AppState.processingQueue.filter((i) => i.included && !i.autoExcluded);
    document.getElementById("metricTotalItems").textContent = active.length;
    document.getElementById("metricActiveFolders").textContent = new Set(active.map(i => i.targetFolder)).size;
    document.getElementById("metricMockups").textContent = active.filter(i => i.sourceRole === "Mockup").length;
    document.getElementById("metricFinalFiles").textContent = active.filter(i => i.sourceRole === "Final File").length;
    document.getElementById("metricAutoRemoved").textContent = AppState.processingQueue.filter(i => i.autoExcluded || !i.included).length;
    document.getElementById("metricNeedsReview").textContent = active.filter(i => i.needsReview).length;
  },

  renderAttentionBox() {
    const pending = AppState.processingQueue.filter((i) => i.included && !i.autoExcluded && i.needsReview);
    const box = document.getElementById("attentionBox");
    const list = document.getElementById("attentionList");
    document.getElementById("attentionCountBadge").textContent = `${pending.length} pendente(s)`;
    if (pending.length === 0) {
      box.classList.add("hidden");
      return;
    }

    const cfg = AppState.getConfig();
    const availableFolders = BreakPointConfig.getStandardFolders(cfg.designNumber, cfg.designLetter, cfg.topwearType, cfg.zipUpLetter);
    box.classList.remove("hidden");
    list.innerHTML = "";

    for (const item of pending) {
      const thumbSrc = item.visualInfo?.thumbUrl || VisualImageInspector.createFallbackPreviewDataUrl(item.originalName, item.sourceRole);
      const folderOptions = availableFolders.includes(item.targetFolder) ? availableFolders : [item.targetFolder, ...availableFolders];
      const card = document.createElement("div");
      card.className = "bg-white border border-[#f5c2be] rounded-xl p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-sm";
      card.innerHTML = `
        <div class="flex items-center gap-4 w-full lg:w-auto">
          <div class="cursor-pointer shrink-0" data-open-modal="${item.id}" title="Clique na imagem para ampliar">
            <img src="${thumbSrc}" alt="Preview" class="w-20 h-20 rounded-xl object-contain bg-[#faf7f1] border-2 border-[#bf2626]" />
          </div>
          <div class="space-y-1.5 flex-1 min-w-0">
            <div class="font-mono text-xs font-bold text-[#17181c] truncate">${item.finalName}</div>
            <div class="text-xs text-[#bf2626] font-semibold">${item.warnings.join(" | ")}</div>
            <div class="pt-1 flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-[#4a463d]">Escolher pasta:</span>
              <select data-att-folder="${item.id}" class="h-9 px-3 rounded-lg bg-[#faf7f1] border-2 border-[#17181c] text-[#17181c] font-mono text-xs font-bold">
                ${folderOptions.map((f) => `<option value="${f}" ${f === item.targetFolder ? "selected" : ""}>${f}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
        <button type="button" data-approve="${item.id}" class="h-9 px-4 rounded-lg bg-[#1b7a4e] hover:bg-[#15603e] text-white text-xs font-bold shadow-sm cursor-pointer">✓ Confirmar</button>
      `;
      list.appendChild(card);
    }

    list.querySelectorAll("[data-open-modal]").forEach(el => el.addEventListener("click", () => this.openImageModal(el.getAttribute("data-open-modal"))));
    list.querySelectorAll("select[data-att-folder]").forEach(sel => sel.addEventListener("change", () => {
      const it = AppState.processingQueue.find(x => x.id === sel.getAttribute("data-att-folder"));
      if (it) {
        it.targetFolder = sel.value;
        it.needsReview = false;
        this.refreshAllPreviewViews();
      }
    }));
    list.querySelectorAll("[data-approve]").forEach(btn => btn.addEventListener("click", () => {
      const it = AppState.processingQueue.find(x => x.id === btn.getAttribute("data-approve"));
      if (it) {
        it.needsReview = false;
        this.refreshAllPreviewViews();
      }
    }));
  },

  renderRemovedFilesBox() {
    const removed = AppState.processingQueue.filter(i => i.autoExcluded);
    const box = document.getElementById("removedFilesBox");
    const list = document.getElementById("removedFilesList");
    document.getElementById("removedCountBadge").textContent = `${removed.length} removidos`;
    if (removed.length === 0) {
      box.classList.add("hidden");
      return;
    }
    box.classList.remove("hidden");
    list.innerHTML = removed.map(item => {
      const thumbSrc = item.visualInfo?.thumbUrl || VisualImageInspector.createFallbackPreviewDataUrl(item.originalName, item.sourceRole);
      return `
        <div class="bg-[#faf7f1] border border-[#dcd3c0] rounded-lg p-2.5 flex items-center justify-between gap-2.5">
          <div class="flex items-center gap-2.5 min-w-0">
            <img src="${thumbSrc}" alt="thumb" data-open-modal="${item.id}" class="w-12 h-12 rounded-lg object-contain bg-white border border-[#cfc6b4] cursor-pointer shrink-0" />
            <div class="min-w-0">
              <div class="font-mono text-xs font-bold text-[#17181c] truncate" title="${item.originalName}">${item.originalName}</div>
              <div class="text-[11px] text-[#785212] truncate">${item.excludeReason}</div>
            </div>
          </div>
          <button type="button" data-restore="${item.id}" class="px-2.5 py-1.5 bg-[#17181c] text-white text-[11px] font-bold rounded-md cursor-pointer shrink-0">Restaurar</button>
        </div>
      `;
    }).join("");
    list.querySelectorAll("[data-open-modal]").forEach(el => el.addEventListener("click", () => this.openImageModal(el.getAttribute("data-open-modal"))));
    list.querySelectorAll("[data-restore]").forEach(btn => btn.addEventListener("click", () => {
      const it = AppState.processingQueue.find(x => x.id === btn.getAttribute("data-restore"));
      if (it) {
        this.restoreAndLearnExcludedItem(it);
        this.refreshAllPreviewViews();
      }
    }));
  },

  renderUnifiedFolderTree() {
    const container = document.getElementById("unifiedTreeContainer");
    const showEmpty = document.getElementById("chkShowEmptyFolders").checked;
    const cfg = AppState.getConfig();
    const stdFolders = BreakPointConfig.getStandardFolders(cfg.designNumber, cfg.designLetter, cfg.topwearType, cfg.zipUpLetter);
    const map = new Map();
    stdFolders.forEach(f => map.set(f, []));
    AppState.processingQueue.filter(x => x.included && !x.autoExcluded).forEach(i => {
      if (!map.has(i.targetFolder)) map.set(i.targetFolder, []);
      map.get(i.targetFolder).push(i);
    });

    const activeFolderCount = Array.from(map.values()).filter(arr => arr.length > 0).length;
    document.getElementById("folderTreeSubtitle").textContent = cfg.onlyCreateActiveFolders
      ? `Upload Parcial Inteligente ativo: criando no ZIP somente as ${activeFolderCount} pasta(s) que possuem arquivos.`
      : `Modo Estrutura Completa: criando todas as ${stdFolders.length} pastas padrão.`;

    container.innerHTML = "";
    for (const [folder, items] of map.entries()) {
      if (!showEmpty && items.length === 0) continue;
      container.innerHTML += `
        <div class="bg-[#faf7f1] border border-[#dcd3c0] rounded-xl p-3.5 space-y-2">
          <div class="flex items-center justify-between border-b border-[#dcd3c0] pb-2">
            <span class="font-mono text-xs font-extrabold text-[#17181c] truncate">📁 ${folder}</span>
            <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#17181c] text-[#faf7f1] font-bold">${items.length} arq.</span>
          </div>
          <div class="max-h-40 overflow-y-auto space-y-1 custom-scroll">
            ${items.map(i => `<div class="text-xs font-mono text-[#17181c] truncate">↳ ${i.finalName}</div>`).join("")}
          </div>
        </div>
      `;
    }
  },

  renderPreviewTable() {
    const tbody = document.getElementById("previewTableBody");
    const search = document.getElementById("inputSearchTable").value.trim().toLowerCase();
    const statusFilter = document.getElementById("selectFilterStatus").value;
    const cfg = AppState.getConfig();
    const availableFolders = BreakPointConfig.getStandardFolders(cfg.designNumber, cfg.designLetter, cfg.topwearType, cfg.zipUpLetter);

    const filtered = AppState.processingQueue.filter((item) => {
      if (statusFilter === "ACTIVE" && (!item.included || item.autoExcluded)) return false;
      if (statusFilter === "REVIEW" && (!item.needsReview || item.autoExcluded)) return false;
      if (statusFilter === "REMOVED" && !item.autoExcluded && item.included) return false;
      if (statusFilter === "MOCKUP" && (item.sourceRole !== "Mockup" || item.autoExcluded)) return false;
      if (statusFilter === "FINAL" && (item.sourceRole !== "Final File" || item.autoExcluded)) return false;
      if (statusFilter === "ZIPUP" && (!item.isZipUp || item.autoExcluded)) return false;
      if (search && !`${item.originalName} ${item.finalName} ${item.targetFolder}`.toLowerCase().includes(search)) return false;
      return true;
    });

    tbody.innerHTML = filtered.map(item => {
      const folderOptions = availableFolders.includes(item.targetFolder) ? availableFolders : [item.targetFolder, ...availableFolders];
      const thumbSrc = item.visualInfo?.thumbUrl || VisualImageInspector.createFallbackPreviewDataUrl(item.originalName, item.sourceRole);
      let statusHtml = `<span class="inline-flex items-center px-3 h-7 rounded-full bg-[#e3f3eb] text-[#15603e] font-bold text-[11px]">✓ Pronto</span>`;
      if (item.autoExcluded) statusHtml = `<span class="inline-flex items-center px-2.5 h-7 rounded bg-[#fce8e6] text-[#bf2626] font-bold text-[11px]">🗑️ Removido</span>`;
      else if (item.needsReview) statusHtml = `<span class="inline-flex items-center px-2.5 h-7 rounded bg-[#fce8e6] text-[#bf2626] font-bold text-[11px]">⚠️ Revisar</span>`;

      return `
        <tr class="hover:bg-[#faf7f1] transition">
          <td class="py-3 px-4 align-middle">
            <div class="w-14 h-14 cursor-pointer rounded-xl overflow-hidden border border-[#cfc6b4] bg-white flex items-center justify-center" data-open-modal="${item.id}">
              <img src="${thumbSrc}" class="w-full h-full object-contain" />
            </div>
          </td>
          <td class="py-3 px-4 align-middle">
            <div class="h-5 flex items-center gap-1.5 mb-1 overflow-hidden">
              <span class="px-1.5 py-0.5 rounded font-extrabold text-[10px] uppercase leading-none ${item.sourceRole === "Mockup" ? "bg-[#e6effd] text-[#1e40af]" : "bg-[#e3f3eb] text-[#15603e]"}">${item.sourceRole}</span>
              ${item.isZipUp ? `<span class="px-1.5 py-0.5 rounded bg-[#17181c] text-[#f3be4f] text-[10px] font-bold uppercase leading-none">Zip Up</span>` : ""}
              <span class="font-mono text-[11px] text-[#4a463d] truncate">${item.originalName}</span>
            </div>
            <input type="text" data-edit-name="${item.id}" value="${item.finalName}" class="w-full h-9 px-3 rounded-lg bg-[#faf7f1] border border-[#cfc6b4] text-xs font-mono font-bold" />
          </td>
          <td class="py-3 px-4 align-middle">
            <div class="h-5 flex items-center mb-1"><span class="text-[10px] font-bold uppercase text-[#78716c] truncate">Categoria: ${item.category}</span></div>
            <select data-edit-folder="${item.id}" class="w-full h-9 px-3 rounded-lg bg-[#faf7f1] border border-[#cfc6b4] text-xs font-mono font-bold">
              ${folderOptions.map(f => `<option value="${f}" ${f === item.targetFolder ? "selected" : ""}>${f}</option>`).join("")}
            </select>
          </td>
          <td class="py-3 px-4 align-middle"><div class="h-5 mb-1"></div><div class="h-9 flex items-center">${statusHtml}</div></td>
          <td class="py-3 px-4 align-middle text-right">
            <div class="h-5 mb-1"></div>
            <button type="button" data-toggle-include="${item.id}" class="h-9 px-3.5 rounded-lg bg-[#17181c] text-white text-xs font-bold cursor-pointer">
              ${item.included && !item.autoExcluded ? "Ignorar" : "✓ Restaurar"}
            </button>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("[data-open-modal]").forEach(el => el.addEventListener("click", () => this.openImageModal(el.getAttribute("data-open-modal"))));
    tbody.querySelectorAll("[data-edit-name]").forEach(inp => inp.addEventListener("change", () => {
      const it = AppState.processingQueue.find(x => x.id === inp.getAttribute("data-edit-name"));
      if (it) {
        it.finalName = inp.value.trim();
        this.renderUnifiedFolderTree();
      }
    }));
    tbody.querySelectorAll("[data-edit-folder]").forEach(sel => sel.addEventListener("change", () => {
      const it = AppState.processingQueue.find(x => x.id === sel.getAttribute("data-edit-folder"));
      if (it) {
        it.targetFolder = sel.value;
        it.needsReview = false;
        it.autoExcluded = false;
        it.included = true;
        this.refreshAllPreviewViews();
      }
    }));
    tbody.querySelectorAll("[data-toggle-include]").forEach(btn => btn.addEventListener("click", () => {
      const it = AppState.processingQueue.find(x => x.id === btn.getAttribute("data-toggle-include"));
      if (it) {
        if (it.autoExcluded) this.restoreAndLearnExcludedItem(it);
        else it.included = !it.included;
        this.refreshAllPreviewViews();
      }
    }));
  },

  async handleConfirmExport() {
    try {
      this.setProgress(true, 20, "Gerando ZIP final...");
      const res = await ZipProcessor.buildUnifiedExportZip(AppState.processingQueue, AppState.getConfig(), (p, msg) => this.setProgress(true, p, msg));
      AppState.lastExportResult = res;
      this.setProgress(false);
      document.getElementById("finalReportSection").classList.remove("hidden");
      document.getElementById("reportSummaryGrid").innerHTML = `
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[11px] font-bold uppercase text-[#4a463d]">Arquivos Exportados</div><div class="text-2xl font-black text-[#15603e]">${AppState.processingQueue.filter(i => i.included && !i.autoExcluded).length}</div></div>
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[11px] font-bold uppercase text-[#4a463d]">Pastas Criadas</div><div class="text-2xl font-black text-[#17181c]">${res.createdFolders.length}</div></div>
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[11px] font-bold uppercase text-[#4a463d]">Removidos</div><div class="text-2xl font-black text-[#b45309]">${AppState.processingQueue.filter(i => i.autoExcluded || !i.included).length}</div></div>
        <div class="bg-[#faf7f1] border border-[#e2dac9] rounded-xl p-3.5"><div class="text-[11px] font-bold uppercase text-[#4a463d]">Integridade</div><div class="text-2xl font-black text-[#1e40af]">100% CRC32</div></div>
      `;
      document.getElementById("reportLogContainer").innerHTML = res.integrityLogs.map(l => `<div><span class="text-[#15603e] font-bold">[OK CRC32:${l.crc32}]</span> ${l.fullZipPath}</div>`).join("");
      document.getElementById("finalReportSection").scrollIntoView({ behavior: "smooth" });
    } catch (e) {
      this.setProgress(false);
      alert(e.message);
    }
  },

  triggerBlobDownload() {
    if (!AppState.lastExportResult?.blob) return;
    const cfg = AppState.getConfig();
    const url = URL.createObjectURL(AppState.lastExportResult.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BreakPoint_#${cfg.designNumber}_${cfg.designLetter}_Organizado.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  handleReset() {
    AppState.mockupFile = null;
    AppState.finalFile = null;
    AppState.extraZipFiles = [];
    AppState.rawEntriesCache = [];
    AppState.processingQueue = [];
    AppState.lastExportResult = null;
    document.getElementById("inputDesignNumber").value = "";
    document.getElementById("inputDesignLetter").value = "";
    document.getElementById("inputZipUpLetter").value = "";
    document.getElementById("inputDefaultAcademy").value = "";
    document.getElementById("fileMockupZip").value = "";
    document.getElementById("fileFinalZip").value = "";
    document.getElementById("fileBothZips").value = "";
    document.getElementById("badgeBothZipsStatus").classList.add("hidden");
    document.getElementById("statusMockupZip").textContent = "Nenhum arquivo selecionado";
    document.getElementById("statusFinalZip").textContent = "Nenhum arquivo selecionado";
    document.getElementById("previewSection").classList.add("hidden");
    document.getElementById("attentionBox").classList.add("hidden");
    document.getElementById("removedFilesBox").classList.add("hidden");
    document.getElementById("finalReportSection").classList.add("hidden");
    window.syncHeaderBadgesImmediate();
  }
};

window.addEventListener("DOMContentLoaded", () => UIController.init());
