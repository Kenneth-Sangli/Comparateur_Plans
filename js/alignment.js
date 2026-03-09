/* ============================================
   ALIGNMENT — Auto-alignement et recalage manuel
   Pour gérer les plans de formats différents
   ============================================ */

const Alignment = {
    // Points de correspondance pour l'alignement manuel
    pointsOld: [],
    pointsNew: [],

    /**
     * Auto-alignement basé sur la détection de contours
     * Essaie d'aligner deux plans de formats potentiellement différents
     * en détectant le cadre/bord principal du dessin
     */
    autoAlign(canvasA, canvasB) {
        const boundsA = this.detectContentBounds(canvasA);
        const boundsB = this.detectContentBounds(canvasB);

        if (!boundsA || !boundsB) {
            return null; // Pas de contenu détecté
        }

        // Calculer l'échelle pour faire correspondre les contenus
        const scaleX = boundsA.width / boundsB.width;
        const scaleY = boundsA.height / boundsB.height;

        // Utiliser une échelle uniforme (la plus petite pour ne pas déborder)
        const scale = Math.min(scaleX, scaleY);

        // Calculer la translation pour centrer B sur A
        const centerAx = boundsA.x + boundsA.width / 2;
        const centerAy = boundsA.y + boundsA.height / 2;
        const centerBx = boundsB.x + boundsB.width / 2;
        const centerBy = boundsB.y + boundsB.height / 2;

        const translateX = (centerAx - centerBx * scale) + (canvasA.width - canvasB.width) / 2;
        const translateY = (centerAy - centerBy * scale) + (canvasA.height - canvasB.height) / 2;

        return {
            scaleX: scale,
            scaleY: scale,
            translateX: translateX,
            translateY: translateY,
            rotation: 0
        };
    },

    /**
     * Détecte les bornes du contenu (zone non-blanche) dans un canvas
     */
    detectContentBounds(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const w = canvas.width;
        const h = canvas.height;

        let minX = w, minY = h, maxX = 0, maxY = 0;
        const threshold = 240; // Pixels plus sombres que ça = contenu

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const gray = Utils.toGrayscale(data[i], data[i + 1], data[i + 2]);
                if (gray < threshold) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        if (maxX <= minX || maxY <= minY) return null;

        return {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY
        };
    },

    /**
     * Calcule une transformation affine à partir de 3 paires de points
     * Utilise la méthode des moindres carrés
     */
    computeTransformFromPoints(srcPoints, dstPoints) {
        if (srcPoints.length < 3 || dstPoints.length < 3) return null;

        // Résolution du système linéaire pour la transformation affine
        // dst = A * src + t
        // On résout pour a, b, c, d, tx, ty :
        // dstX = a*srcX + b*srcY + tx
        // dstY = c*srcX + d*srcY + ty

        const n = Math.min(srcPoints.length, dstPoints.length);
        let sumSxSx = 0, sumSySy = 0, sumSxSy = 0;
        let sumSx = 0, sumSy = 0;
        let sumDxSx = 0, sumDxSy = 0, sumDx = 0;
        let sumDySx = 0, sumDySy = 0, sumDy = 0;

        for (let i = 0; i < n; i++) {
            const sx = srcPoints[i].x, sy = srcPoints[i].y;
            const dx = dstPoints[i].x, dy = dstPoints[i].y;
            sumSxSx += sx * sx;
            sumSySy += sy * sy;
            sumSxSy += sx * sy;
            sumSx += sx;
            sumSy += sy;
            sumDxSx += dx * sx;
            sumDxSy += dx * sy;
            sumDx += dx;
            sumDySx += dy * sx;
            sumDySy += dy * sy;
            sumDy += dy;
        }

        // Système 3x3 pour résoudre [a, b, tx] et [c, d, ty]
        const det = sumSxSx * (sumSySy * n - sumSy * sumSy)
                  - sumSxSy * (sumSxSy * n - sumSy * sumSx)
                  + sumSx * (sumSxSy * sumSy - sumSySy * sumSx);

        if (Math.abs(det) < 1e-10) return null;

        const a = (sumDxSx * (sumSySy * n - sumSy * sumSy)
                 - sumDxSy * (sumSxSy * n - sumSy * sumSx)
                 + sumDx * (sumSxSy * sumSy - sumSySy * sumSx)) / det;

        const b = (sumSxSx * (sumDxSy * n - sumDx * sumSy)
                 - sumSxSy * (sumDxSx * n - sumDx * sumSx)
                 + sumSx * (sumDxSx * sumSy - sumDxSy * sumSx)) / det;

        const tx = (sumSxSx * (sumSySy * sumDx - sumSy * sumDxSy)
                  - sumSxSy * (sumSxSy * sumDx - sumSy * sumDxSx)
                  + sumSx * (sumSxSy * sumDxSy - sumSySy * sumDxSx)) / det;

        const c = (sumDySx * (sumSySy * n - sumSy * sumSy)
                 - sumDySy * (sumSxSy * n - sumSy * sumSx)
                 + sumDy * (sumSxSy * sumSy - sumSySy * sumSx)) / det;

        const d = (sumSxSx * (sumDySy * n - sumDy * sumSy)
                 - sumSxSy * (sumDySx * n - sumDy * sumSx)
                 + sumSx * (sumDySx * sumSy - sumDySy * sumSx)) / det;

        const ty = (sumSxSx * (sumSySy * sumDy - sumSy * sumDySy)
                  - sumSxSy * (sumSxSy * sumDy - sumSy * sumDySx)
                  + sumSx * (sumSxSy * sumDySy - sumSySy * sumDySx)) / det;

        return { a, b, c, d, tx, ty };
    },

    /**
     * Applique une transformation affine (points manuels) à un canvas
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

    /**
     * Reset les points d'alignement manuel
     */
    resetPoints() {
        this.pointsOld = [];
        this.pointsNew = [];
    },

    /**
     * Ajoute un point à l'ancien plan
     */
    addPointOld(x, y) {
        if (this.pointsOld.length < 3) {
            this.pointsOld.push({ x, y });
        }
    },

    /**
     * Ajoute un point au nouveau plan
     */
    addPointNew(x, y) {
        if (this.pointsNew.length < 3) {
            this.pointsNew.push({ x, y });
        }
    },

    /**
     * Dessine les points de correspondance sur un canvas
     */
    drawPoints(canvas, points, color = '#e74c3c') {
        const ctx = canvas.getContext('2d');
        points.forEach((pt, i) => {
            // Cercle
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Numéro
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), pt.x, pt.y);
        });
    }
};
