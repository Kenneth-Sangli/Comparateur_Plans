/* ============================================
   COMPARATOR — Moteur de comparaison visuelle
   ============================================ */

const Comparator = {
    /**
     * Crée la superposition colorée :
     * - Identique → Noir
     * - Ancien uniquement (supprimé) → Rouge
     * - Nouveau uniquement (ajouté) → Bleu
     *
     * @param {HTMLCanvasElement} canvasOld - Ancien plan (normalisé)
     * @param {HTMLCanvasElement} canvasNew - Nouveau plan (normalisé)
     * @param {number} sensitivity - Seuil de sensibilité (0-100)
     * @returns {HTMLCanvasElement} Canvas du résultat
     */
    createOverlay(canvasOld, canvasNew, sensitivity = 30) {
        const w = canvasOld.width;
        const h = canvasOld.height;
        const dataOld = Utils.getImageData(canvasOld);
        const dataNew = Utils.getImageData(canvasNew);

        const result = document.createElement('canvas');
        result.width = w;
        result.height = h;
        const ctx = result.getContext('2d');
        const output = ctx.createImageData(w, h);

        const pixOld = dataOld.data;
        const pixNew = dataNew.data;
        const pixOut = output.data;

        // Seuil pour considérer un pixel comme "tracé" (non blanc)
        const contentThreshold = 255 - Math.round(sensitivity * 2.5);
        // Seuil de différence de couleur
        const diffThreshold = Math.round(sensitivity * 0.8);

        for (let i = 0; i < pixOld.length; i += 4) {
            const grayOld = Utils.toGrayscale(pixOld[i], pixOld[i + 1], pixOld[i + 2]);
            const grayNew = Utils.toGrayscale(pixNew[i], pixNew[i + 1], pixNew[i + 2]);

            const isContentOld = grayOld < contentThreshold;
            const isContentNew = grayNew < contentThreshold;

            const diff = Math.abs(grayOld - grayNew);

            if (isContentOld && isContentNew && diff <= diffThreshold) {
                // Identique → Noir
                pixOut[i] = 0;
                pixOut[i + 1] = 0;
                pixOut[i + 2] = 0;
                pixOut[i + 3] = 255;
            } else if (isContentOld && (!isContentNew || diff > diffThreshold)) {
                // Supprimé (ancien) → Rouge
                pixOut[i] = 231;     // #e74c3c
                pixOut[i + 1] = 76;
                pixOut[i + 2] = 60;
                pixOut[i + 3] = 255;
            } else if (isContentNew && (!isContentOld || diff > diffThreshold)) {
                // Ajouté (nouveau) → Bleu
                pixOut[i] = 41;      // #2980b9
                pixOut[i + 1] = 128;
                pixOut[i + 2] = 185;
                pixOut[i + 3] = 255;
            } else {
                // Fond blanc
                pixOut[i] = 255;
                pixOut[i + 1] = 255;
                pixOut[i + 2] = 255;
                pixOut[i + 3] = 255;
            }
        }

        ctx.putImageData(output, 0, 0);
        return result;
    },

    /**
     * Crée un canvas ne montrant que les différences
     * (zones supprimées en rouge, ajoutées en bleu, le reste transparent/blanc)
     */
    createDiffOnly(canvasOld, canvasNew, sensitivity = 30) {
        const w = canvasOld.width;
        const h = canvasOld.height;
        const dataOld = Utils.getImageData(canvasOld);
        const dataNew = Utils.getImageData(canvasNew);

        const result = document.createElement('canvas');
        result.width = w;
        result.height = h;
        const ctx = result.getContext('2d');
        const output = ctx.createImageData(w, h);

        const pixOld = dataOld.data;
        const pixNew = dataNew.data;
        const pixOut = output.data;

        const contentThreshold = 255 - Math.round(sensitivity * 2.5);
        const diffThreshold = Math.round(sensitivity * 0.8);

        for (let i = 0; i < pixOld.length; i += 4) {
            const grayOld = Utils.toGrayscale(pixOld[i], pixOld[i + 1], pixOld[i + 2]);
            const grayNew = Utils.toGrayscale(pixNew[i], pixNew[i + 1], pixNew[i + 2]);

            const isContentOld = grayOld < contentThreshold;
            const isContentNew = grayNew < contentThreshold;
            const diff = Math.abs(grayOld - grayNew);

            if (isContentOld && isContentNew && diff <= diffThreshold) {
                // Identique → gris très léger (contexte)
                pixOut[i] = 230;
                pixOut[i + 1] = 230;
                pixOut[i + 2] = 230;
                pixOut[i + 3] = 255;
            } else if (isContentOld && (!isContentNew || diff > diffThreshold)) {
                // Supprimé → Rouge
                pixOut[i] = 231;
                pixOut[i + 1] = 76;
                pixOut[i + 2] = 60;
                pixOut[i + 3] = 255;
            } else if (isContentNew && (!isContentOld || diff > diffThreshold)) {
                // Ajouté → Bleu
                pixOut[i] = 41;
                pixOut[i + 1] = 128;
                pixOut[i + 2] = 185;
                pixOut[i + 3] = 255;
            } else {
                // Fond blanc
                pixOut[i] = 255;
                pixOut[i + 1] = 255;
                pixOut[i + 2] = 255;
                pixOut[i + 3] = 255;
            }
        }

        ctx.putImageData(output, 0, 0);
        return result;
    },

    /**
     * Crée un canvas de superposition avec opacité réglable
     * pour le mode "overlay" avec slider d'opacité
     */
    createBlendedOverlay(canvasOld, canvasNew, opacity = 0.5) {
        const w = canvasOld.width;
        const h = canvasOld.height;

        const result = document.createElement('canvas');
        result.width = w;
        result.height = h;
        const ctx = result.getContext('2d');

        // Teinter l'ancien en rouge
        const tintedOld = this._tintCanvas(canvasOld, 231, 76, 60);
        // Teinter le nouveau en bleu
        const tintedNew = this._tintCanvas(canvasNew, 41, 128, 185);

        // Dessiner ancien
        ctx.globalAlpha = 1 - opacity;
        ctx.drawImage(tintedOld, 0, 0);

        // Superposer nouveau
        ctx.globalAlpha = opacity;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(tintedNew, 0, 0);

        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        return result;
    },

    /**
     * Teinte un canvas (multiplie les pixels sombres par une couleur)
     */
    _tintCanvas(sourceCanvas, r, g, b) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;
        const result = document.createElement('canvas');
        result.width = w;
        result.height = h;
        const ctx = result.getContext('2d');
        const sourceData = Utils.getImageData(sourceCanvas);
        const output = ctx.createImageData(w, h);
        const src = sourceData.data;
        const dst = output.data;

        for (let i = 0; i < src.length; i += 4) {
            const gray = Utils.toGrayscale(src[i], src[i + 1], src[i + 2]);
            const factor = 1 - gray / 255; // 0 = blanc, 1 = noir

            dst[i] = Math.round(255 - factor * (255 - r));
            dst[i + 1] = Math.round(255 - factor * (255 - g));
            dst[i + 2] = Math.round(255 - factor * (255 - b));
            dst[i + 3] = 255;
        }

        ctx.putImageData(output, 0, 0);
        return result;
    }
};
