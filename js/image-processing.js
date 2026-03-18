/* ============================================
   IMAGE PROCESSING — Pré-traitement des plans
   Binarisation, morphologie, normalisation
   ============================================ */

const ImageProcessing = {

    /**
     * Pipeline complet de pré-traitement d'un plan
     * Convertit un canvas couleur en canvas binaire (noir/blanc) propre
     */
    preprocess(canvas) {
        const w = canvas.width;
        const h = canvas.height;

        // 1. Extraire en niveaux de gris
        const gray = this.toGrayscaleArray(canvas);

        // 2. Binarisation adaptative (Sauvola-like)
        const binary = this.adaptiveBinarize(gray, w, h, 31, 0.2);

        // 3. Nettoyage morphologique (fermeture pour combler les micro-trous)
        const cleaned = this.morphClose(binary, w, h, 1);

        // 4. Reconvertir en canvas
        return this.binaryToCanvas(cleaned, w, h);
    },

    /**
     * Convertit un canvas en tableau de niveaux de gris (Uint8Array)
     */
    toGrayscaleArray(canvas) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const gray = new Uint8Array(canvas.width * canvas.height);

        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
            gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        }
        return gray;
    },

    /**
     * Binarisation adaptative inspirée de Sauvola
     * Gère les variations de luminosité/contraste entre plans
     * @param {Uint8Array} gray - Image en niveaux de gris
     * @param {number} w - Largeur
     * @param {number} h - Hauteur
     * @param {number} blockSize - Taille du bloc local (impaire)
     * @param {number} k - Paramètre de sensibilité (0.1 à 0.5)
     * @returns {Uint8Array} Image binaire (0 = trait, 255 = fond)
     */
    adaptiveBinarize(gray, w, h, blockSize = 31, k = 0.2) {
        const binary = new Uint8Array(w * h);
        const half = Math.floor(blockSize / 2);

        // Calculer l'intégrale et l'intégrale des carrés pour accélérer
        const integral = new Float64Array((w + 1) * (h + 1));
        const integralSq = new Float64Array((w + 1) * (h + 1));

        for (let y = 0; y < h; y++) {
            let rowSum = 0, rowSumSq = 0;
            for (let x = 0; x < w; x++) {
                const v = gray[y * w + x];
                rowSum += v;
                rowSumSq += v * v;
                integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
                integralSq[(y + 1) * (w + 1) + (x + 1)] = integralSq[y * (w + 1) + (x + 1)] + rowSumSq;
            }
        }

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const x1 = Math.max(0, x - half);
                const y1 = Math.max(0, y - half);
                const x2 = Math.min(w - 1, x + half);
                const y2 = Math.min(h - 1, y + half);
                const area = (x2 - x1 + 1) * (y2 - y1 + 1);

                const sum = integral[(y2 + 1) * (w + 1) + (x2 + 1)]
                          - integral[y1 * (w + 1) + (x2 + 1)]
                          - integral[(y2 + 1) * (w + 1) + x1]
                          + integral[y1 * (w + 1) + x1];

                const sumSq = integralSq[(y2 + 1) * (w + 1) + (x2 + 1)]
                            - integralSq[y1 * (w + 1) + (x2 + 1)]
                            - integralSq[(y2 + 1) * (w + 1) + x1]
                            + integralSq[y1 * (w + 1) + x1];

                const mean = sum / area;
                const variance = (sumSq / area) - (mean * mean);
                const stddev = Math.sqrt(Math.max(0, variance));

                // Seuil de Sauvola
                const threshold = mean * (1 + k * (stddev / 128 - 1));

                binary[y * w + x] = gray[y * w + x] <= threshold ? 0 : 255;
            }
        }

        return binary;
    },

    /**
     * Fermeture morphologique (dilatation puis érosion)
     * Comble les petits trous dans les traits
     */
    morphClose(binary, w, h, radius = 1) {
        const dilated = this.dilate(binary, w, h, radius);
        return this.erode(dilated, w, h, radius);
    },

    /**
     * Dilatation morphologique (étend les zones noires)
     */
    dilate(binary, w, h, radius = 1) {
        const result = new Uint8Array(w * h);
        result.fill(255);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (binary[y * w + x] === 0) {
                    // Ce pixel est noir → étendre aux voisins
                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            const nx = x + dx, ny = y + dy;
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                result[ny * w + nx] = 0;
                            }
                        }
                    }
                }
            }
        }
        return result;
    },

    /**
     * Érosion morphologique (réduit les zones noires)
     */
    erode(binary, w, h, radius = 1) {
        const result = new Uint8Array(w * h);
        result.fill(255);

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let allBlack = true;
                for (let dy = -radius; dy <= radius && allBlack; dy++) {
                    for (let dx = -radius; dx <= radius && allBlack; dx++) {
                        const nx = x + dx, ny = y + dy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            if (binary[ny * w + nx] !== 0) allBlack = false;
                        } else {
                            allBlack = false;
                        }
                    }
                }
                if (allBlack) result[y * w + x] = 0;
            }
        }
        return result;
    },

    /**
     * Convertit un tableau binaire en canvas
     */
    binaryToCanvas(binary, w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const imgData = ctx.createImageData(w, h);
        const data = imgData.data;

        for (let i = 0, j = 0; i < binary.length; i++, j += 4) {
            data[j] = data[j + 1] = data[j + 2] = binary[i];
            data[j + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);
        return canvas;
    },

    /**
     * Extrait un tableau binaire depuis un canvas (0 = trait, 255 = fond)
     */
    canvasToBinary(canvas) {
        const ctx = canvas.getContext('2d');
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;
        const binary = new Uint8Array(canvas.width * canvas.height);

        for (let i = 0, j = 0; i < binary.length; i++, j += 4) {
            // Si le pixel est plus sombre que 128 → trait (0)
            const gray = Math.round(0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2]);
            binary[i] = gray < 128 ? 0 : 255;
        }
        return binary;
    },

    /**
     * Sous-échantillonne une image binaire
     */
    downsample(binary, w, h, factor) {
        const nw = Math.floor(w / factor);
        const nh = Math.floor(h / factor);
        const result = new Uint8Array(nw * nh);

        for (let y = 0; y < nh; y++) {
            for (let x = 0; x < nw; x++) {
                // Prendre le pixel le plus sombre dans le bloc
                let minVal = 255;
                for (let dy = 0; dy < factor; dy++) {
                    for (let dx = 0; dx < factor; dx++) {
                        const sx = x * factor + dx;
                        const sy = y * factor + dy;
                        if (sx < w && sy < h) {
                            minVal = Math.min(minVal, binary[sy * w + sx]);
                        }
                    }
                }
                result[y * nw + x] = minVal;
            }
        }
        return { data: result, width: nw, height: nh };
    },

    /**
     * Supprime les composantes connexes trop petites (bruit)
     * @param {Uint8Array} binary - Image binaire
     * @param {number} w - Largeur
     * @param {number} h - Hauteur
     * @param {number} minSize - Taille minimale en pixels pour garder un composant
     * @returns {Uint8Array} Image nettoyée
     */
    removeSmallComponents(binary, w, h, minSize = 20) {
        const labels = new Int32Array(w * h);
        labels.fill(-1);
        let currentLabel = 0;
        const componentSizes = [];

        // BFS labeling
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (binary[idx] === 0 && labels[idx] === -1) {
                    // Nouveau composant noir
                    const queue = [idx];
                    labels[idx] = currentLabel;
                    let size = 0;

                    while (queue.length > 0) {
                        const ci = queue.pop();
                        size++;
                        const cx = ci % w;
                        const cy = Math.floor(ci / w);

                        // 4-connectivité
                        const neighbors = [
                            cy > 0 ? ci - w : -1,
                            cy < h - 1 ? ci + w : -1,
                            cx > 0 ? ci - 1 : -1,
                            cx < w - 1 ? ci + 1 : -1
                        ];

                        for (const ni of neighbors) {
                            if (ni >= 0 && binary[ni] === 0 && labels[ni] === -1) {
                                labels[ni] = currentLabel;
                                queue.push(ni);
                            }
                        }
                    }

                    componentSizes.push(size);
                    currentLabel++;
                }
            }
        }

        // Filtrer les petits composants
        const result = new Uint8Array(w * h);
        result.fill(255);

        for (let i = 0; i < labels.length; i++) {
            if (labels[i] >= 0 && componentSizes[labels[i]] >= minSize) {
                result[i] = 0;
            }
        }

        return result;
    }
};
