/* ============================================
   PDF RENDERER — Rendu PDF et images vers Canvas
   Gère les différents formats de plans
   ============================================ */

const PdfRenderer = {
    /**
     * Charge un fichier (PDF ou image) et retourne un canvas rendu
     * @param {File} file - Le fichier à charger
     * @param {number} pageNum - Numéro de page (1-based, pour PDF)
     * @param {number} scale - Facteur de résolution (2 = haute qualité)
     * @returns {Promise<{canvas: HTMLCanvasElement, pageCount: number}>}
     */
    async loadFile(file, pageNum = 1, scale = 2) {
        if (Utils.isPDF(file)) {
            return this.loadPDF(file, pageNum, scale);
        } else if (Utils.isImage(file)) {
            return this.loadImage(file);
        }
        throw new Error('Format de fichier non supporté');
    },

    /**
     * Charge un PDF et rend une page sur un canvas
     */
    async loadPDF(file, pageNum = 1, scale = 2) {
        const arrayBuffer = await Utils.fileToArrayBuffer(file);
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        return {
            canvas,
            pageCount: pdf.numPages
        };
    },

    /**
     * Charge une image et la rend sur un canvas
     */
    async loadImage(file) {
        const img = await Utils.fileToImage(file);
        const canvas = Utils.imageToCanvas(img);

        return {
            canvas,
            pageCount: 1
        };
    },

    /**
     * Normalise deux canvas pour qu'ils aient la même taille
     * Gère les plans de formats/tailles différents
     * @param {HTMLCanvasElement} canvasA
     * @param {HTMLCanvasElement} canvasB
     * @param {Object} transform - Transformation d'alignement optionnelle
     * @returns {{canvasA: HTMLCanvasElement, canvasB: HTMLCanvasElement, width: number, height: number}}
     */
    normalizeCanvases(canvasA, canvasB, transform = null) {
        const wA = canvasA.width, hA = canvasA.height;
        const wB = canvasB.width, hB = canvasB.height;

        // Taille cible = la plus grande des deux dimensions
        const targetW = Math.max(wA, wB);
        const targetH = Math.max(hA, hB);

        const normA = document.createElement('canvas');
        normA.width = targetW;
        normA.height = targetH;
        const ctxA = normA.getContext('2d');
        // Fond blanc
        ctxA.fillStyle = '#FFFFFF';
        ctxA.fillRect(0, 0, targetW, targetH);
        // Centrer le plan A
        const offAx = Math.round((targetW - wA) / 2);
        const offAy = Math.round((targetH - hA) / 2);
        ctxA.drawImage(canvasA, offAx, offAy);

        const normB = document.createElement('canvas');
        normB.width = targetW;
        normB.height = targetH;
        const ctxB = normB.getContext('2d');
        ctxB.fillStyle = '#FFFFFF';
        ctxB.fillRect(0, 0, targetW, targetH);

        if (transform) {
            // Appliquer la transformation d'alignement
            ctxB.save();
            ctxB.translate(targetW / 2, targetH / 2);
            ctxB.rotate(transform.rotation || 0);
            ctxB.scale(transform.scaleX || 1, transform.scaleY || 1);
            ctxB.translate(-targetW / 2, -targetH / 2);
            ctxB.translate(transform.translateX || 0, transform.translateY || 0);
            const offBx = Math.round((targetW - wB) / 2);
            const offBy = Math.round((targetH - hB) / 2);
            ctxB.drawImage(canvasB, offBx, offBy);
            ctxB.restore();
        } else {
            // Centrer le plan B
            const offBx = Math.round((targetW - wB) / 2);
            const offBy = Math.round((targetH - hB) / 2);
            ctxB.drawImage(canvasB, offBx, offBy);
        }

        return {
            canvasA: normA,
            canvasB: normB,
            width: targetW,
            height: targetH
        };
    },

    /**
     * Met à l'échelle un canvas selon un facteur de zoom
     */
    scaleCanvas(sourceCanvas, zoom) {
        const w = Math.round(sourceCanvas.width * zoom);
        const h = Math.round(sourceCanvas.height * zoom);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceCanvas, 0, 0, w, h);
        return canvas;
    }
};
