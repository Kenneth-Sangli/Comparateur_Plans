/* ============================================
   UTILS — Fonctions utilitaires
   ============================================ */

const Utils = {
    /**
     * Convertit un fichier en ArrayBuffer
     */
    fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Convertit un fichier image en élément Image
     */
    fileToImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Impossible de charger l\'image'));
            };
            img.src = url;
        });
    },

    /**
     * Vérifie si le fichier est un PDF
     */
    isPDF(file) {
        return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    },

    /**
     * Vérifie si le fichier est une image
     */
    isImage(file) {
        const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];
        const imageExts = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.tif'];
        return imageTypes.includes(file.type) || imageExts.some(ext => file.name.toLowerCase().endsWith(ext));
    },

    /**
     * Vérifie si le type de fichier est accepté
     */
    isAcceptedFile(file) {
        return this.isPDF(file) || this.isImage(file);
    },

    /**
     * Formate la taille d'un fichier
     */
    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' o';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
        return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
    },

    /**
     * Crée un canvas temporaire à partir d'une image
     */
    imageToCanvas(img, maxWidth, maxHeight) {
        const canvas = document.createElement('canvas');
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;

        if (maxWidth && maxHeight) {
            const ratio = Math.min(maxWidth / w, maxHeight / h, 1);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        return canvas;
    },

    /**
     * Obtient les données ImageData d'un canvas
     */
    getImageData(canvas) {
        const ctx = canvas.getContext('2d');
        return ctx.getImageData(0, 0, canvas.width, canvas.height);
    },

    /**
     * Convertit un pixel en niveau de gris
     */
    toGrayscale(r, g, b) {
        return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    },

    /**
     * Binarise un niveau de gris avec un seuil
     */
    binarize(gray, threshold = 200) {
        return gray < threshold ? 0 : 255;
    },

    /**
     * Clamp une valeur entre min et max
     */
    clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    },

    /**
     * Debounce une fonction
     */
    debounce(fn, delay = 100) {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    }
};
