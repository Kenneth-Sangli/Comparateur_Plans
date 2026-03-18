/* ============================================
   ALIGNMENT — Alignement robuste de plans
   Corrélation croisée multi-échelle + recalage manuel
   ============================================ */

const Alignment = {
    // Points de correspondance pour l'alignement manuel
    pointsOld: [],
    pointsNew: [],

    /**
     * Auto-alignement robuste par corrélation croisée multi-échelle
     * Fonctionne en 3 passes : grossier → moyen → fin
     *
     * @param {HTMLCanvasElement} canvasA - Ancien plan (pré-traité en binaire)
     * @param {HTMLCanvasElement} canvasB - Nouveau plan (pré-traité en binaire)
     * @returns {{dx: number, dy: number, scale: number}|null} Meilleur offset trouvé
     */
    autoAlign(canvasA, canvasB) {
        // Extraire les binaires
        const binA = ImageProcessing.canvasToBinary(canvasA);
        const binB = ImageProcessing.canvasToBinary(canvasB);
        const wA = canvasA.width, hA = canvasA.height;
        const wB = canvasB.width, hB = canvasB.height;

        // Étape 1 : Détecter les bounding boxes du contenu
        const boundsA = this._detectBounds(binA, wA, hA);
        const boundsB = this._detectBounds(binB, wB, hB);

        if (!boundsA || !boundsB) return null;

        // Étape 2 : Calculer l'échelle entre les deux plans
        const scaleX = boundsA.width / boundsB.width;
        const scaleY = boundsA.height / boundsB.height;
        const scale = (scaleX + scaleY) / 2; // Moyenne des deux axes

        // Étape 3 : Mettre B à l'échelle de A si nécessaire
        let alignedB = binB, alignedW = wB, alignedH = hB;
        if (Math.abs(scale - 1) > 0.02) {
            const scaled = this._scaleBinary(binB, wB, hB, scale);
            alignedB = scaled.data;
            alignedW = scaled.width;
            alignedH = scaled.height;
        }

        // Étape 4 : Corrélation croisée multi-échelle (coarse-to-fine)
        // Passe 1 : sous-échantillonné 8x, recherche large
        const dsA1 = ImageProcessing.downsample(binA, wA, hA, 8);
        const dsB1 = ImageProcessing.downsample(alignedB, alignedW, alignedH, 8);
        const maxSearch1 = Math.max(Math.round(Math.max(dsA1.width, dsA1.height) * 0.25), 50);
        const best1 = this._correlationSearch(dsA1, dsB1, 0, 0, maxSearch1, 2);

        // Passe 2 : sous-échantillonné 4x, recherche autour du meilleur de passe 1
        const dsA2 = ImageProcessing.downsample(binA, wA, hA, 4);
        const dsB2 = ImageProcessing.downsample(alignedB, alignedW, alignedH, 4);
        const best2 = this._correlationSearch(dsA2, dsB2, best1.dx * 2, best1.dy * 2, 10, 1);

        // Passe 3 : sous-échantillonné 2x, recherche fine
        const dsA3 = ImageProcessing.downsample(binA, wA, hA, 2);
        const dsB3 = ImageProcessing.downsample(alignedB, alignedW, alignedH, 2);
        const best3 = this._correlationSearch(dsA3, dsB3, best2.dx * 2, best2.dy * 2, 6, 1);

        // Passe 4 : échelle originale, recherche pixel-perfect
        const finalImg = { data: binA, width: wA, height: hA };
        const finalImgB = { data: alignedB, width: alignedW, height: alignedH };
        const best4 = this._correlationSearch(finalImg, finalImgB, best3.dx * 2, best3.dy * 2, 3, 1);

        return { dx: best4.dx, dy: best4.dy, scale, score: best4.score };
    },

    /**
     * Recherche par corrélation croisée le meilleur offset (dx, dy)
     * Maximise le nombre de pixels noirs qui se superposent
     */
    _correlationSearch(imgA, imgB, centerDx, centerDy, searchRange, step) {
        const wA = imgA.width, hA = imgA.height;
        const wB = imgB.width, hB = imgB.height;
        const dA = imgA.data, dB = imgB.data;

        let bestDx = centerDx, bestDy = centerDy;
        let bestScore = -Infinity;

        for (let dy = centerDy - searchRange; dy <= centerDy + searchRange; dy += step) {
            for (let dx = centerDx - searchRange; dx <= centerDx + searchRange; dx += step) {
                let overlap = 0;
                let totalA = 0;
                let totalB = 0;

                // Calculer l'overlap des pixels noirs
                const startX = Math.max(0, -dx);
                const startY = Math.max(0, -dy);
                const endX = Math.min(wA, wB - dx);
                const endY = Math.min(hA, hB - dy);

                // Échantillonner pour la performance (pas besoin de vérifier chaque pixel)
                const sampleStep = Math.max(1, Math.floor(Math.min(endX - startX, endY - startY) / 200));

                for (let y = startY; y < endY; y += sampleStep) {
                    for (let x = startX; x < endX; x += sampleStep) {
                        const idxA = y * wA + x;
                        const idxB = (y + dy) * wB + (x + dx);

                        const isBlackA = dA[idxA] === 0;
                        const isBlackB = dB[idxB] === 0;

                        if (isBlackA) totalA++;
                        if (isBlackB) totalB++;
                        if (isBlackA && isBlackB) overlap++;
                    }
                }

                // Score = overlap normalisé (Jaccard-like)
                const union = totalA + totalB - overlap;
                const score = union > 0 ? overlap / union : 0;

                if (score > bestScore) {
                    bestScore = score;
                    bestDx = dx;
                    bestDy = dy;
                }
            }
        }

        return { dx: bestDx, dy: bestDy, score: bestScore };
    },

    /**
     * Détecte les bornes du contenu dans une image binaire
     */
    _detectBounds(binary, w, h) {
        let minX = w, minY = h, maxX = 0, maxY = 0;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (binary[y * w + x] === 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX <= minX || maxY <= minY) return null;
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    },

    /**
     * Met à l'échelle une image binaire
     */
    _scaleBinary(binary, w, h, scale) {
        const nw = Math.round(w * scale);
        const nh = Math.round(h * scale);
        const result = new Uint8Array(nw * nh);
        result.fill(255);

        for (let y = 0; y < nh; y++) {
            for (let x = 0; x < nw; x++) {
                const sx = Math.floor(x / scale);
                const sy = Math.floor(y / scale);
                if (sx < w && sy < h) {
                    result[y * nw + x] = binary[sy * w + sx];
                }
            }
        }
        return { data: result, width: nw, height: nh };
    },

    /**
     * Applique l'alignement trouvé pour normaliser deux canvas à la même taille
     * Retourne deux canvas binaires alignés et de même dimension
     */
    applyAutoAlignment(canvasA, canvasB, alignment) {
        const wA = canvasA.width, hA = canvasA.height;
        let wB = canvasB.width, hB = canvasB.height;

        // Mettre B à l'échelle si nécessaire
        let scaledB = canvasB;
        if (Math.abs(alignment.scale - 1) > 0.02) {
            const nw = Math.round(wB * alignment.scale);
            const nh = Math.round(hB * alignment.scale);
            scaledB = document.createElement('canvas');
            scaledB.width = nw;
            scaledB.height = nh;
            const ctx = scaledB.getContext('2d');
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, nw, nh);
            ctx.drawImage(canvasB, 0, 0, nw, nh);
            wB = nw;
            hB = nh;
        }

        // Taille cible = assez grande pour contenir les deux, alignés
        // Rappel : A[x,y] ~ B[x+dx, y+dy], donc pour aligner :
        // output_A(fx) = offAx + fx
        // output_B(fx+dx) = offBx + fx + dx
        // Pour que output_A = output_B : offBx = offAx - dx
        const offAx = Math.max(0, alignment.dx) + 10;
        const offAy = Math.max(0, alignment.dy) + 10;
        const offBx = offAx - alignment.dx;
        const offBy = offAy - alignment.dy;

        const targetW = Math.max(offAx + wA, offBx + wB) + 10;
        const targetH = Math.max(offAy + hA, offBy + hB) + 10;

        const resultA = document.createElement('canvas');
        resultA.width = targetW;
        resultA.height = targetH;
        const ctxA = resultA.getContext('2d');
        ctxA.fillStyle = '#FFFFFF';
        ctxA.fillRect(0, 0, targetW, targetH);
        ctxA.drawImage(canvasA, offAx, offAy);

        const resultB = document.createElement('canvas');
        resultB.width = targetW;
        resultB.height = targetH;
        const ctxB = resultB.getContext('2d');
        ctxB.fillStyle = '#FFFFFF';
        ctxB.fillRect(0, 0, targetW, targetH);
        ctxB.drawImage(scaledB, offBx, offBy);

        return { canvasA: resultA, canvasB: resultB, width: targetW, height: targetH };
    },

    /**
     * Calcule une transformation affine à partir de 3+ paires de points
     */
    computeTransformFromPoints(srcPoints, dstPoints) {
        if (srcPoints.length < 3 || dstPoints.length < 3) return null;

        const n = Math.min(srcPoints.length, dstPoints.length);
        let sumSxSx = 0, sumSySy = 0, sumSxSy = 0;
        let sumSx = 0, sumSy = 0;
        let sumDxSx = 0, sumDxSy = 0, sumDx = 0;
        let sumDySx = 0, sumDySy = 0, sumDy = 0;

        for (let i = 0; i < n; i++) {
            const sx = srcPoints[i].x, sy = srcPoints[i].y;
            const dx = dstPoints[i].x, dy = dstPoints[i].y;
            sumSxSx += sx * sx; sumSySy += sy * sy; sumSxSy += sx * sy;
            sumSx += sx; sumSy += sy;
            sumDxSx += dx * sx; sumDxSy += dx * sy; sumDx += dx;
            sumDySx += dy * sx; sumDySy += dy * sy; sumDy += dy;
        }

        const det = sumSxSx * (sumSySy * n - sumSy * sumSy)
                  - sumSxSy * (sumSxSy * n - sumSy * sumSx)
                  + sumSx * (sumSxSy * sumSy - sumSySy * sumSx);

        if (Math.abs(det) < 1e-10) return null;

        const a = (sumDxSx * (sumSySy * n - sumSy * sumSy) - sumDxSy * (sumSxSy * n - sumSy * sumSx) + sumDx * (sumSxSy * sumSy - sumSySy * sumSx)) / det;
        const b = (sumSxSx * (sumDxSy * n - sumDx * sumSy) - sumSxSy * (sumDxSx * n - sumDx * sumSx) + sumSx * (sumDxSx * sumSy - sumDxSy * sumSx)) / det;
        const tx = (sumSxSx * (sumSySy * sumDx - sumSy * sumDxSy) - sumSxSy * (sumSxSy * sumDx - sumSy * sumDxSx) + sumSx * (sumSxSy * sumDxSy - sumSySy * sumDxSx)) / det;
        const c = (sumDySx * (sumSySy * n - sumSy * sumSy) - sumDySy * (sumSxSy * n - sumSy * sumSx) + sumDy * (sumSxSy * sumSy - sumSySy * sumSx)) / det;
        const d = (sumSxSx * (sumDySy * n - sumDy * sumSy) - sumSxSy * (sumDySx * n - sumDy * sumSx) + sumSx * (sumDySx * sumSy - sumDySy * sumSx)) / det;
        const ty = (sumSxSx * (sumSySy * sumDy - sumSy * sumDySy) - sumSxSy * (sumSxSy * sumDy - sumSy * sumDySx) + sumSx * (sumSxSy * sumDySy - sumSySy * sumDySx)) / det;

        return { a, b, c, d, tx, ty };
    },

    /**
     * Applique une transformation affine à un canvas
     */
    applyAffineTransform(sourceCanvas, targetWidth, targetHeight, affine) {
        const result = document.createElement('canvas');
        result.width = targetWidth;
        result.height = targetHeight;
        const ctx = result.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.save();
        ctx.setTransform(affine.a, affine.c, affine.b, affine.d, affine.tx, affine.ty);
        ctx.drawImage(sourceCanvas, 0, 0);
        ctx.restore();
        return result;
    },

    resetPoints() {
        this.pointsOld = [];
        this.pointsNew = [];
    },

    addPointOld(x, y) {
        if (this.pointsOld.length < 3) {
            this.pointsOld.push({ x, y });
        }
    },

    addPointNew(x, y) {
        if (this.pointsNew.length < 3) {
            this.pointsNew.push({ x, y });
        }
    },

    drawPoints(canvas, points, color = '#e74c3c') {
        const ctx = canvas.getContext('2d');
        points.forEach((pt, i) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), pt.x, pt.y);
        });
    }
};
