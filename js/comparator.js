/* ============================================
   COMPARATOR — Moteur de comparaison tolérante
   Élimine les faux positifs par tolérance spatiale
   + post-traitement anti-bruit
   Rendu basé sur les plans ORIGINAUX (haute qualité)
   ============================================ */

const Comparator = {

    /**
     * Comparaison tolérante avec rendu haute qualité.
     * Utilise les binaires pour la LOGIQUE, les originaux pour le RENDU.
     *
     * @param {HTMLCanvasElement} binOld - Ancien plan binarisé (aligné)
     * @param {HTMLCanvasElement} binNew - Nouveau plan binarisé (aligné)
     * @param {HTMLCanvasElement} rawOld - Ancien plan original (aligné, haute qualité)
     * @param {HTMLCanvasElement} rawNew - Nouveau plan original (aligné, haute qualité)
     * @param {number} tolerance - Rayon de tolérance en pixels (1-10)
     * @param {number} minComponentSize - Taille min d'une différence
     * @returns {{overlay: HTMLCanvasElement, diffOnly: HTMLCanvasElement, stats: Object}}
     */
    compare(binOld, binNew, rawOld, rawNew, tolerance = 4, minComponentSize = 30) {
        const w = binOld.width;
        const h = binOld.height;

        // 1. Extraire les binaires (0 = trait, 255 = fond)
        const bOld = ImageProcessing.canvasToBinary(binOld);
        const bNew = ImageProcessing.canvasToBinary(binNew);

        // 2. Dilater chaque plan → zones de tolérance
        const dilatedOld = ImageProcessing.dilate(bOld, w, h, tolerance);
        const dilatedNew = ImageProcessing.dilate(bNew, w, h, tolerance);

        // 3. Classification pixel par pixel
        const rawRemoved = new Uint8Array(w * h);
        const rawAdded = new Uint8Array(w * h);
        const same = new Uint8Array(w * h);

        let countSame = 0, countRemoved = 0, countAdded = 0;

        for (let i = 0; i < w * h; i++) {
            const isOld = bOld[i] === 0;
            const isNew = bNew[i] === 0;
            const inDilatedOld = dilatedOld[i] === 0;
            const inDilatedNew = dilatedNew[i] === 0;

            if (isOld && inDilatedNew) {
                same[i] = 1;
                countSame++;
            } else if (isOld && !inDilatedNew) {
                rawRemoved[i] = 1;
                countRemoved++;
            }

            if (isNew && inDilatedOld) {
                if (!same[i]) { same[i] = 1; }
            } else if (isNew && !inDilatedOld) {
                rawAdded[i] = 1;
                countAdded++;
            }
        }

        // 4. Post-traitement : supprimer les petits composants (bruit)
        const cleanedRemoved = minComponentSize > 0
            ? ImageProcessing.removeSmallComponents(this._maskToBinary(rawRemoved, w * h), w, h, minComponentSize)
            : this._maskToBinary(rawRemoved, w * h);

        const cleanedAdded = minComponentSize > 0
            ? ImageProcessing.removeSmallComponents(this._maskToBinary(rawAdded, w * h), w, h, minComponentSize)
            : this._maskToBinary(rawAdded, w * h);

        // 5. Extraire les pixels originaux pour le rendu haute qualité
        const rawOldData = rawOld.getContext('2d').getImageData(0, 0, w, h).data;
        const rawNewData = rawNew.getContext('2d').getImageData(0, 0, w, h).data;

        // 6. Générer les résultats visuels
        const overlay = this._createOverlayCanvas(same, cleanedRemoved, cleanedAdded, rawOldData, rawNewData, w, h);
        const diffOnly = this._createDiffOnlyCanvas(same, cleanedRemoved, cleanedAdded, rawOldData, rawNewData, w, h);

        // Statistiques
        let finalRemoved = 0, finalAdded = 0;
        for (let i = 0; i < w * h; i++) {
            if (cleanedRemoved[i] === 0) finalRemoved++;
            if (cleanedAdded[i] === 0) finalAdded++;
        }

        return {
            overlay,
            diffOnly,
            stats: {
                same: countSame,
                removed: finalRemoved,
                added: finalAdded,
                total: countSame + finalRemoved + finalAdded
            }
        };
    },

    _maskToBinary(mask, length) {
        const result = new Uint8Array(length);
        result.fill(255);
        for (let i = 0; i < length; i++) {
            if (mask[i] === 1) result[i] = 0;
        }
        return result;
    },

    /**
     * Overlay : plan original en fond + différences colorées par-dessus
     * - Zones identiques → plan original désaturé (gris)
     * - Supprimé → rouge vif sur le tracé original
     * - Ajouté → bleu vif sur le tracé original
     * - Fond (ni ancien ni nouveau) → blanc
     */
    _createOverlayCanvas(same, removed, added, rawOldPx, rawNewPx, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(w, h);
        const out = imgData.data;

        for (let i = 0, j = 0; i < w * h; i++, j += 4) {
            if (removed[i] === 0) {
                // Supprimé → teinter le pixel original ancien en rouge
                const gray = 0.299 * rawOldPx[j] + 0.587 * rawOldPx[j + 1] + 0.114 * rawOldPx[j + 2];
                const darkness = 1 - gray / 255; // 0=blanc, 1=noir
                // Plus le trait est sombre, plus le rouge est vif
                out[j]     = Math.round(255 - darkness * (255 - 200));  // R
                out[j + 1] = Math.round(255 - darkness * 255);          // G → 0
                out[j + 2] = Math.round(255 - darkness * 255);          // B → 0
                out[j + 3] = 255;
            } else if (added[i] === 0) {
                // Ajouté → teinter le pixel original nouveau en bleu
                const gray = 0.299 * rawNewPx[j] + 0.587 * rawNewPx[j + 1] + 0.114 * rawNewPx[j + 2];
                const darkness = 1 - gray / 255;
                out[j]     = Math.round(255 - darkness * 255);          // R → 0
                out[j + 1] = Math.round(255 - darkness * (255 - 80));   // G
                out[j + 2] = Math.round(255 - darkness * (255 - 210));  // B
                out[j + 3] = 255;
            } else if (same[i] === 1) {
                // Identique → plan original en gris (désaturé)
                const grayOld = 0.299 * rawOldPx[j] + 0.587 * rawOldPx[j + 1] + 0.114 * rawOldPx[j + 2];
                const grayNew = 0.299 * rawNewPx[j] + 0.587 * rawNewPx[j + 1] + 0.114 * rawNewPx[j + 2];
                const g = Math.round(Math.min(grayOld, grayNew));
                out[j] = g; out[j + 1] = g; out[j + 2] = g; out[j + 3] = 255;
            } else {
                // Fond → affiche le fond original (blanc/crème) du nouveau plan
                out[j]     = rawNewPx[j];
                out[j + 1] = rawNewPx[j + 1];
                out[j + 2] = rawNewPx[j + 2];
                out[j + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas;
    },

    /**
     * Diff only : fond clair avec le plan original en filigrane + différences colorées vibrantes
     */
    _createDiffOnlyCanvas(same, removed, added, rawOldPx, rawNewPx, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(w, h);
        const out = imgData.data;

        for (let i = 0, j = 0; i < w * h; i++, j += 4) {
            if (removed[i] === 0) {
                // Supprimé → rouge vif
                const gray = 0.299 * rawOldPx[j] + 0.587 * rawOldPx[j + 1] + 0.114 * rawOldPx[j + 2];
                const darkness = 1 - gray / 255;
                out[j]     = Math.round(255 - darkness * (255 - 200));
                out[j + 1] = Math.round(255 - darkness * 255);
                out[j + 2] = Math.round(255 - darkness * 255);
                out[j + 3] = 255;
            } else if (added[i] === 0) {
                // Ajouté → bleu vif
                const gray = 0.299 * rawNewPx[j] + 0.587 * rawNewPx[j + 1] + 0.114 * rawNewPx[j + 2];
                const darkness = 1 - gray / 255;
                out[j]     = Math.round(255 - darkness * 255);
                out[j + 1] = Math.round(255 - darkness * (255 - 80));
                out[j + 2] = Math.round(255 - darkness * (255 - 210));
                out[j + 3] = 255;
            } else if (same[i] === 1) {
                // Identique → gris très clair (contexte léger)
                const grayOld = 0.299 * rawOldPx[j] + 0.587 * rawOldPx[j + 1] + 0.114 * rawOldPx[j + 2];
                // Éclaircir fortement : ramener vers 230
                const g = Math.round(230 + (grayOld - 230) * 0.3);
                out[j] = g; out[j + 1] = g; out[j + 2] = g; out[j + 3] = 255;
            } else {
                // Fond
                out[j] = 255; out[j + 1] = 255; out[j + 2] = 255; out[j + 3] = 255;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas;
    }
};
