/* ============================================
   APP — Application principale
   Orchestre tous les modules
   ============================================ */

(function () {
    'use strict';

    // ── État de l'application ──
    const state = {
        fileOld: null,
        fileNew: null,
        canvasOld: null,    // Canvas rendu brut de l'ancien plan
        canvasNew: null,    // Canvas rendu brut du nouveau plan
        normOld: null,      // Canvas normalisé (même taille)
        normNew: null,      // Canvas normalisé
        overlayCanvas: null,
        diffCanvas: null,
        pageOld: 1,
        pageNew: 1,
        pageCountOld: 1,
        pageCountNew: 1,
        currentMode: 'overlay',
        zoom: 1,
        minZoom: 0.1,
        maxZoom: 5,
        sensitivity: 30,
        opacity: 0.5,
        alignTransform: null,
        isPanning: false,
        panStart: { x: 0, y: 0 },
        scrollStart: { x: 0, y: 0 }
    };

    // ── Initialisation ──
    function init() {
        bindUploadEvents();
        bindCompareButton();
        bindViewTabs();
        bindControls();
        bindModals();
        bindSlider();
        bindZoom();
        bindPan();
        bindAlignmentModal();
        bindExport();
        bindKeyboard();
    }

    // ── Upload / Drag & Drop ──
    function bindUploadEvents() {
        ['Old', 'New'].forEach(suffix => {
            const zone = document.getElementById(`dropZone${suffix}`);
            const input = document.getElementById(`file${suffix}`);
            const target = suffix.toLowerCase();

            // Click
            zone.addEventListener('click', () => input.click());

            // File input change
            input.addEventListener('change', (e) => {
                if (e.target.files.length) handleFile(e.target.files[0], target);
            });

            // Drag events
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.classList.add('dragover');
            });

            zone.addEventListener('dragleave', () => {
                zone.classList.remove('dragover');
            });

            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('dragover');
                if (e.dataTransfer.files.length) {
                    handleFile(e.dataTransfer.files[0], target);
                }
            });
        });
    }

    async function handleFile(file, target) {
        if (!Utils.isAcceptedFile(file)) {
            UI.showToast('Format non supporté. Utilisez PDF, PNG, JPG, BMP ou TIFF.', 'error');
            return;
        }

        if (target === 'old') {
            state.fileOld = file;
        } else {
            state.fileNew = file;
        }

        UI.updateUploadStatus(target, file);

        // Detecter nb de pages si PDF
        if (Utils.isPDF(file)) {
            try {
                const arrayBuffer = await Utils.fileToArrayBuffer(file);
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const pageCount = pdf.numPages;
                if (target === 'old') state.pageCountOld = pageCount;
                else state.pageCountNew = pageCount;
                UI.updatePageSelector(target, pageCount);
            } catch (err) {
                UI.showToast('Erreur lors de la lecture du PDF.', 'error');
            }
        } else {
            if (target === 'old') state.pageCountOld = 1;
            else state.pageCountNew = 1;
            UI.updatePageSelector(target, 1);
        }

        // Activer le bouton comparer si les deux fichiers sont chargés
        const btn = document.getElementById('compareBtn');
        btn.disabled = !(state.fileOld && state.fileNew);
    }

    // ── Comparaison ──
    function bindCompareButton() {
        document.getElementById('compareBtn').addEventListener('click', runComparison);

        // Page selectors
        document.getElementById('pageOld').addEventListener('change', (e) => {
            state.pageOld = parseInt(e.target.value);
        });
        document.getElementById('pageNew').addEventListener('change', (e) => {
            state.pageNew = parseInt(e.target.value);
        });

        // Nouvelle comparaison
        document.getElementById('newCompareBtn').addEventListener('click', resetAll);
    }

    async function runComparison() {
        if (!state.fileOld || !state.fileNew) return;

        UI.showLoading('Chargement des plans...');

        try {
            // 1. Charger les deux plans
            const [resultOld, resultNew] = await Promise.all([
                PdfRenderer.loadFile(state.fileOld, state.pageOld),
                PdfRenderer.loadFile(state.fileNew, state.pageNew)
            ]);

            state.canvasOld = resultOld.canvas;
            state.canvasNew = resultNew.canvas;

            UI.showLoading('Alignement et comparaison...');

            // 2. Normaliser (même taille), avec transformation si définie
            const norm = PdfRenderer.normalizeCanvases(
                state.canvasOld,
                state.canvasNew,
                state.alignTransform
            );
            state.normOld = norm.canvasA;
            state.normNew = norm.canvasB;

            // 3. Générer la comparaison
            generateComparisons();

            // 4. Afficher la section résultat
            document.getElementById('uploadSection').classList.add('hidden');
            document.getElementById('resultSection').classList.remove('hidden');

            // 5. Dessiner le mode actif
            state.currentMode = 'overlay';
            UI.switchViewMode('overlay');
            renderCurrentMode();

            // 6. Ajuster le zoom
            fitZoom();

            UI.hideLoading();
            UI.showToast('Comparaison terminée !', 'success');
        } catch (err) {
            UI.hideLoading();
            console.error(err);
            UI.showToast('Erreur lors de la comparaison : ' + err.message, 'error');
        }
    }

    function generateComparisons() {
        state.overlayCanvas = Comparator.createOverlay(
            state.normOld, state.normNew, state.sensitivity
        );
        state.diffCanvas = Comparator.createDiffOnly(
            state.normOld, state.normNew, state.sensitivity
        );
    }

    function renderCurrentMode() {
        const z = state.zoom;

        switch (state.currentMode) {
            case 'overlay':
                // Superposition colorée avec opacité
                const blended = Comparator.createOverlay(
                    state.normOld, state.normNew, state.sensitivity
                );
                UI.drawToCanvas('canvasOverlay', blended, z);
                break;

            case 'slider':
                UI.drawToCanvas('canvasSliderOld', state.normOld, z);
                UI.drawToCanvas('canvasSliderNew', state.normNew, z);
                // Ajuster la taille du conteneur slider
                const sliderContainer = document.getElementById('sliderContainer');
                sliderContainer.style.width = Math.round(state.normOld.width * z) + 'px';
                sliderContainer.style.height = Math.round(state.normOld.height * z) + 'px';
                updateSliderPosition(50);
                break;

            case 'sidebyside':
                UI.drawToCanvas('canvasSideOld', state.normOld, z);
                UI.drawToCanvas('canvasSideNew', state.normNew, z);
                break;

            case 'diff':
                const diff = Comparator.createDiffOnly(
                    state.normOld, state.normNew, state.sensitivity
                );
                UI.drawToCanvas('canvasDiff', diff, z);
                break;
        }
    }

    // ── View Tabs ──
    function bindViewTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => {
                state.currentMode = tab.dataset.mode;
                UI.switchViewMode(state.currentMode);
                renderCurrentMode();
            });
        });
    }

    // ── Controls ──
    function bindControls() {
        // Opacité
        const opacitySlider = document.getElementById('opacitySlider');
        opacitySlider.addEventListener('input', (e) => {
            state.opacity = parseInt(e.target.value) / 100;
            document.getElementById('opacityValue').textContent = e.target.value + '%';
            renderCurrentMode();
        });

        // Sensibilité
        const sensitivitySlider = document.getElementById('sensitivitySlider');
        sensitivitySlider.addEventListener('input', Utils.debounce((e) => {
            state.sensitivity = parseInt(e.target.value);
            document.getElementById('sensitivityValue').textContent = e.target.value;
            generateComparisons();
            renderCurrentMode();
        }, 200));

        // Alignement
        document.getElementById('autoAlignBtn').addEventListener('click', () => {
            if (!state.canvasOld || !state.canvasNew) return;
            UI.showLoading('Auto-alignement en cours...');
            setTimeout(() => {
                state.alignTransform = Alignment.autoAlign(state.canvasOld, state.canvasNew);
                if (state.alignTransform) {
                    // Refaire la normalisation avec le transform
                    const norm = PdfRenderer.normalizeCanvases(
                        state.canvasOld, state.canvasNew, state.alignTransform
                    );
                    state.normOld = norm.canvasA;
                    state.normNew = norm.canvasB;
                    generateComparisons();
                    renderCurrentMode();
                    UI.hideLoading();
                    UI.showToast('Plans alignés automatiquement', 'success');
                } else {
                    UI.hideLoading();
                    UI.showToast('Impossible d\'aligner automatiquement. Essayez l\'alignement manuel.', 'error');
                }
            }, 50);
        });

        document.getElementById('manualAlignBtn').addEventListener('click', () => {
            if (!state.canvasOld || !state.canvasNew) return;
            openAlignmentModal();
        });

        document.getElementById('resetAlignBtn').addEventListener('click', () => {
            state.alignTransform = null;
            Alignment.resetPoints();
            if (state.canvasOld && state.canvasNew) {
                const norm = PdfRenderer.normalizeCanvases(state.canvasOld, state.canvasNew);
                state.normOld = norm.canvasA;
                state.normNew = norm.canvasB;
                generateComparisons();
                renderCurrentMode();
                UI.showToast('Alignement réinitialisé', 'info');
            }
        });
    }

    // ── Zoom ──
    function bindZoom() {
        document.getElementById('zoomInBtn').addEventListener('click', () => {
            state.zoom = Math.min(state.zoom * 1.25, state.maxZoom);
            updateZoomDisplay();
            renderCurrentMode();
        });

        document.getElementById('zoomOutBtn').addEventListener('click', () => {
            state.zoom = Math.max(state.zoom / 1.25, state.minZoom);
            updateZoomDisplay();
            renderCurrentMode();
        });

        document.getElementById('zoomFitBtn').addEventListener('click', () => {
            fitZoom();
            renderCurrentMode();
        });

        // Scroll wheel zoom
        document.getElementById('canvasContainer').addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                state.zoom = Math.min(state.zoom * 1.1, state.maxZoom);
            } else {
                state.zoom = Math.max(state.zoom / 1.1, state.minZoom);
            }
            updateZoomDisplay();
            renderCurrentMode();
        }, { passive: false });
    }

    function fitZoom() {
        if (!state.normOld) return;
        const container = document.getElementById('canvasContainer');
        const cw = container.clientWidth - 40;
        const ch = container.clientHeight - 40;
        const iw = state.normOld.width;
        const ih = state.normOld.height;
        state.zoom = Math.min(cw / iw, ch / ih, 1);
        updateZoomDisplay();
    }

    function updateZoomDisplay() {
        document.getElementById('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
    }

    // ── Pan (déplacement) ──
    function bindPan() {
        const container = document.getElementById('canvasContainer');

        container.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            state.isPanning = true;
            state.panStart = { x: e.clientX, y: e.clientY };
            state.scrollStart = { x: container.scrollLeft, y: container.scrollTop };
            container.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!state.isPanning) return;
            container.scrollLeft = state.scrollStart.x - (e.clientX - state.panStart.x);
            container.scrollTop = state.scrollStart.y - (e.clientY - state.panStart.y);
        });

        window.addEventListener('mouseup', () => {
            state.isPanning = false;
            document.getElementById('canvasContainer').style.cursor = 'grab';
        });

        // Touch support for tablets
        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                state.isPanning = true;
                state.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                state.scrollStart = { x: container.scrollLeft, y: container.scrollTop };
            }
        }, { passive: true });

        container.addEventListener('touchmove', (e) => {
            if (!state.isPanning || e.touches.length !== 1) return;
            container.scrollLeft = state.scrollStart.x - (e.touches[0].clientX - state.panStart.x);
            container.scrollTop = state.scrollStart.y - (e.touches[0].clientY - state.panStart.y);
        }, { passive: true });

        container.addEventListener('touchend', () => {
            state.isPanning = false;
        });
    }

    // ── Slider avant/après ──
    function bindSlider() {
        const handle = document.getElementById('sliderHandle');
        const container = document.getElementById('sliderContainer');
        let isDragging = false;

        function onMove(clientX) {
            if (!isDragging) return;
            const rect = container.getBoundingClientRect();
            const x = clientX - rect.left;
            const pct = Utils.clamp((x / rect.width) * 100, 0, 100);
            updateSliderPosition(pct);
        }

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            isDragging = true;
        });

        window.addEventListener('mousemove', (e) => onMove(e.clientX));
        window.addEventListener('mouseup', () => { isDragging = false; });

        // Touch
        handle.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            isDragging = true;
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) onMove(e.touches[0].clientX);
        }, { passive: true });

        window.addEventListener('touchend', () => { isDragging = false; });

        // Click on container to move slider
        container.addEventListener('click', (e) => {
            const rect = container.getBoundingClientRect();
            const pct = Utils.clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
            updateSliderPosition(pct);
        });
    }

    function updateSliderPosition(pct) {
        const clip = document.getElementById('sliderClip');
        const handle = document.getElementById('sliderHandle');
        clip.style.width = pct + '%';
        handle.style.left = pct + '%';
    }

    // ── Alignment Modal ──
    function openAlignmentModal() {
        Alignment.resetPoints();
        UI.toggleModal('alignModal', true);

        // Dessiner les plans dans les canvas d'alignement
        const scaleA = Math.min(600 / state.canvasOld.width, 400 / state.canvasOld.height, 1);
        const scaleB = Math.min(600 / state.canvasNew.width, 400 / state.canvasNew.height, 1);

        const canvasA = document.getElementById('canvasAlignOld');
        canvasA.width = Math.round(state.canvasOld.width * scaleA);
        canvasA.height = Math.round(state.canvasOld.height * scaleA);
        canvasA.getContext('2d').drawImage(state.canvasOld, 0, 0, canvasA.width, canvasA.height);

        const canvasB = document.getElementById('canvasAlignNew');
        canvasB.width = Math.round(state.canvasNew.width * scaleB);
        canvasB.height = Math.round(state.canvasNew.height * scaleB);
        canvasB.getContext('2d').drawImage(state.canvasNew, 0, 0, canvasB.width, canvasB.height);

        canvasA._scale = scaleA;
        canvasB._scale = scaleB;

        updateAlignBadges();
    }

    function bindAlignmentModal() {
        const canvasA = document.getElementById('canvasAlignOld');
        const canvasB = document.getElementById('canvasAlignNew');

        canvasA.addEventListener('click', (e) => {
            const rect = canvasA.getBoundingClientRect();
            const x = (e.clientX - rect.left) / (canvasA._scale || 1);
            const y = (e.clientY - rect.top) / (canvasA._scale || 1);
            Alignment.addPointOld(x, y);

            // Redessiner avec les points
            const ctx = canvasA.getContext('2d');
            ctx.drawImage(state.canvasOld, 0, 0, canvasA.width, canvasA.height);
            const scaledPts = Alignment.pointsOld.map(p => ({
                x: p.x * (canvasA._scale || 1),
                y: p.y * (canvasA._scale || 1)
            }));
            Alignment.drawPoints(canvasA, scaledPts, '#e74c3c');
            updateAlignBadges();
        });

        canvasB.addEventListener('click', (e) => {
            const rect = canvasB.getBoundingClientRect();
            const x = (e.clientX - rect.left) / (canvasB._scale || 1);
            const y = (e.clientY - rect.top) / (canvasB._scale || 1);
            Alignment.addPointNew(x, y);

            const ctx = canvasB.getContext('2d');
            ctx.drawImage(state.canvasNew, 0, 0, canvasB.width, canvasB.height);
            const scaledPts = Alignment.pointsNew.map(p => ({
                x: p.x * (canvasB._scale || 1),
                y: p.y * (canvasB._scale || 1)
            }));
            Alignment.drawPoints(canvasB, scaledPts, '#2980b9');
            updateAlignBadges();
        });

        document.getElementById('alignResetBtn').addEventListener('click', () => {
            Alignment.resetPoints();
            const ctxA = canvasA.getContext('2d');
            ctxA.drawImage(state.canvasOld, 0, 0, canvasA.width, canvasA.height);
            const ctxB = canvasB.getContext('2d');
            ctxB.drawImage(state.canvasNew, 0, 0, canvasB.width, canvasB.height);
            updateAlignBadges();
        });

        document.getElementById('alignApplyBtn').addEventListener('click', () => {
            const affine = Alignment.computeTransformFromPoints(
                Alignment.pointsNew,  // source = nouveau
                Alignment.pointsOld   // destination = ancien
            );
            if (!affine) {
                UI.showToast('Impossible de calculer l\'alignement', 'error');
                return;
            }

            // Appliquer la transformation
            const alignedNew = Alignment.applyAffineTransform(
                state.canvasNew,
                state.canvasOld.width,
                state.canvasOld.height,
                affine
            );

            // Renormaliser
            const norm = PdfRenderer.normalizeCanvases(state.canvasOld, alignedNew);
            state.normOld = norm.canvasA;
            state.normNew = norm.canvasB;

            generateComparisons();
            renderCurrentMode();
            UI.toggleModal('alignModal', false);
            UI.showToast('Alignement manuel appliqué', 'success');
        });
    }

    function updateAlignBadges() {
        document.getElementById('alignPointsOld').textContent = Alignment.pointsOld.length + '/3';
        document.getElementById('alignPointsNew').textContent = Alignment.pointsNew.length + '/3';

        const canApply = Alignment.pointsOld.length >= 3 && Alignment.pointsNew.length >= 3;
        document.getElementById('alignApplyBtn').disabled = !canApply;
    }

    // ── Modals ──
    function bindModals() {
        // Help
        document.getElementById('helpBtn').addEventListener('click', () => {
            UI.toggleModal('helpModal', true);
        });
        document.getElementById('closeHelp').addEventListener('click', () => {
            UI.toggleModal('helpModal', false);
        });

        // Align
        document.getElementById('closeAlign').addEventListener('click', () => {
            UI.toggleModal('alignModal', false);
        });

        // Close on backdrop click
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                backdrop.parentElement.classList.add('hidden');
            });
        });
    }

    // ── Export ──
    function bindExport() {
        document.getElementById('exportBtn').addEventListener('click', () => {
            let canvas;
            switch (state.currentMode) {
                case 'overlay':
                    canvas = document.getElementById('canvasOverlay');
                    break;
                case 'diff':
                    canvas = document.getElementById('canvasDiff');
                    break;
                case 'slider':
                    canvas = document.getElementById('canvasSliderNew');
                    break;
                case 'sidebyside':
                    // Assembler les deux côtes
                    const sOld = document.getElementById('canvasSideOld');
                    const sNew = document.getElementById('canvasSideNew');
                    canvas = document.createElement('canvas');
                    canvas.width = sOld.width + sNew.width + 4;
                    canvas.height = Math.max(sOld.height, sNew.height);
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(sOld, 0, 0);
                    ctx.drawImage(sNew, sOld.width + 4, 0);
                    break;
            }

            if (!canvas) return;

            const link = document.createElement('a');
            link.download = `comparaison_plans_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            UI.showToast('Image exportée', 'success');
        });
    }

    // ── Keyboard shortcuts ──
    function bindKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal:not(.hidden)').forEach(m => {
                    m.classList.add('hidden');
                });
            }
            if (e.key === '+' || e.key === '=') {
                state.zoom = Math.min(state.zoom * 1.25, state.maxZoom);
                updateZoomDisplay();
                renderCurrentMode();
            }
            if (e.key === '-') {
                state.zoom = Math.max(state.zoom / 1.25, state.minZoom);
                updateZoomDisplay();
                renderCurrentMode();
            }
        });
    }

    // ── Reset ──
    function resetAll() {
        state.fileOld = null;
        state.fileNew = null;
        state.canvasOld = null;
        state.canvasNew = null;
        state.normOld = null;
        state.normNew = null;
        state.overlayCanvas = null;
        state.diffCanvas = null;
        state.pageOld = 1;
        state.pageNew = 1;
        state.pageCountOld = 1;
        state.pageCountNew = 1;
        state.zoom = 1;
        state.alignTransform = null;
        Alignment.resetPoints();

        UI.resetUploadStatus('old');
        UI.resetUploadStatus('new');
        document.getElementById('compareBtn').disabled = true;
        document.getElementById('pageSelector').classList.add('hidden');
        document.getElementById('fileOld').value = '';
        document.getElementById('fileNew').value = '';

        document.getElementById('resultSection').classList.add('hidden');
        document.getElementById('uploadSection').classList.remove('hidden');
    }

    // ── Lancement ──
    document.addEventListener('DOMContentLoaded', init);
})();
