/* ============================================
   UI — Gestion de l'interface utilisateur
   ============================================ */

const UI = {
    /**
     * Affiche le loading overlay
     */
    showLoading(text = 'Analyse des plans en cours...') {
        const overlay = document.getElementById('loadingOverlay');
        document.getElementById('loadingText').textContent = text;
        overlay.classList.remove('hidden');
    },

    /**
     * Cache le loading overlay
     */
    hideLoading() {
        document.getElementById('loadingOverlay').classList.add('hidden');
    },

    /**
     * Affiche/cache une modale
     */
    toggleModal(modalId, show) {
        const modal = document.getElementById(modalId);
        if (show) {
            modal.classList.remove('hidden');
        } else {
            modal.classList.add('hidden');
        }
    },

    /**
     * Met à jour le statut d'upload d'une zone
     */
    updateUploadStatus(target, file) {
        const zone = document.getElementById(target === 'old' ? 'dropZoneOld' : 'dropZoneNew');
        const status = document.getElementById(target === 'old' ? 'statusOld' : 'statusNew');

        zone.classList.add('loaded');
        status.textContent = `✓ ${file.name} (${Utils.formatFileSize(file.size)})`;
    },

    /**
     * Reset le statut d'upload
     */
    resetUploadStatus(target) {
        const zone = document.getElementById(target === 'old' ? 'dropZoneOld' : 'dropZoneNew');
        const status = document.getElementById(target === 'old' ? 'statusOld' : 'statusNew');

        zone.classList.remove('loaded');
        status.textContent = '';
    },

    /**
     * Met à jour le sélecteur de pages PDF
     */
    updatePageSelector(target, pageCount) {
        const selector = document.getElementById('pageSelector');
        const group = document.getElementById(target === 'old' ? 'pageSelectorOld' : 'pageSelectorNew');
        const select = document.getElementById(target === 'old' ? 'pageOld' : 'pageNew');
        const countSpan = document.getElementById(target === 'old' ? 'pageCountOld' : 'pageCountNew');

        if (pageCount > 1) {
            selector.classList.remove('hidden');
            group.style.display = '';

            select.innerHTML = '';
            for (let i = 1; i <= pageCount; i++) {
                const option = document.createElement('option');
                option.value = i;
                option.textContent = `Page ${i}`;
                select.appendChild(option);
            }
            countSpan.textContent = `(${pageCount} pages)`;
        } else {
            group.style.display = 'none';
            // Si les deux sont 1 page, cacher complètement
            const otherTarget = target === 'old' ? 'new' : 'old';
            const otherGroup = document.getElementById(otherTarget === 'old' ? 'pageSelectorOld' : 'pageSelectorNew');
            if (otherGroup.style.display === 'none') {
                selector.classList.add('hidden');
            }
        }
    },

    /**
     * Gestion des onglets de vue
     */
    switchViewMode(mode) {
        // Tabs
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-mode="${mode}"]`).classList.add('active');

        // Views
        const views = {
            overlay: 'overlayView',
            slider: 'sliderView',
            sidebyside: 'sideBySideView',
            diff: 'diffView'
        };

        Object.entries(views).forEach(([key, id]) => {
            const el = document.getElementById(id);
            if (key === mode) {
                el.classList.remove('hidden');
                if (key === 'sidebyside') el.classList.add('active-view');
            } else {
                el.classList.add('hidden');
                if (key === 'sidebyside') el.classList.remove('active-view');
            }
        });

        // Afficher/cacher les contrôles selon le mode
        const toleranceCtrl = document.getElementById('toleranceControl');
        const minSizeCtrl = document.getElementById('minSizeControl');
        const legend = document.getElementById('legend');

        const showComparisonControls = mode === 'overlay' || mode === 'diff';
        toleranceCtrl.classList.toggle('hidden', !showComparisonControls);
        minSizeCtrl.classList.toggle('hidden', !showComparisonControls);

        if (mode === 'slider' || mode === 'sidebyside') {
            legend.classList.add('hidden');
        } else {
            legend.classList.remove('hidden');
        }
    },

    /**
     * Dessine un canvas source dans un canvas cible
     */
    drawToCanvas(targetCanvasId, sourceCanvas, zoom = 1) {
        const target = document.getElementById(targetCanvasId);
        const w = Math.round(sourceCanvas.width * zoom);
        const h = Math.round(sourceCanvas.height * zoom);
        target.width = w;
        target.height = h;
        const ctx = target.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceCanvas, 0, 0, w, h);
    },

    /**
     * Affiche un toast / notification
     */
    showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; padding: 12px 20px;
            background: ${type === 'error' ? '#e74c3c' : type === 'success' ? '#28a745' : '#0066CC'};
            color: white; border-radius: 8px; font-size: 0.9rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 3000;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

// Toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
`;
document.head.appendChild(style);
