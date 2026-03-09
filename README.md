# Comparateur de Plans — Eiffage

Outil web de comparaison visuelle de plans de chantier. Permet de détecter instantanément les différences entre un ancien et un nouveau plan.

## Fonctionnalités

- **4 modes de vue** : Superposition colorée, Curseur avant/après, Côte à côte, Différences seules
- **Multi-format** : PDF (multi-pages), PNG, JPG, BMP, TIFF
- **Alignement intelligent** : Auto-alignement par détection de contenu + alignement manuel par points de correspondance
- **Export** : Téléchargement du résultat en PNG
- **100% client-side** : Aucun fichier n'est envoyé vers un serveur — tout reste sur l'appareil

## Utilisation

1. Ouvrir l'application dans un navigateur
2. Glisser-déposer l'ancien plan (gauche) et le nouveau plan (droite)
3. Cliquer sur "Comparer les plans"
4. Explorer les différences avec les différents modes de vue

## Légende des couleurs

| Couleur | Signification |
|---------|--------------|
| **Noir** | Éléments identiques |
| **Rouge** | Éléments supprimés (présents uniquement dans l'ancien) |
| **Bleu** | Éléments ajoutés (présents uniquement dans le nouveau) |

## Déploiement

L'application est une page web statique. Pour la déployer :

1. Activer GitHub Pages sur ce repo (Settings → Pages → Source: main, Folder: / (root))
2. L'application sera accessible à `https://<username>.github.io/Comparateur_Plans/`

### Intégration Teams

Pour ajouter comme onglet dans Microsoft Teams :
1. Dans un canal Teams, cliquer sur "+" pour ajouter un onglet
2. Choisir "Site web"
3. Coller l'URL GitHub Pages

## Sécurité

- **Aucun serveur** : Le traitement est 100% côté navigateur
- **Aucun stockage** : Les fichiers ne sont pas conservés après fermeture
- **Aucune dépendance externe** sauf PDF.js (Mozilla) et Font Awesome (icônes), chargés via CDN

## Technologies

- HTML5 / CSS3 / JavaScript (Vanilla)
- [PDF.js](https://mozilla.github.io/pdf.js/) (Mozilla) — Rendu des PDF
- Canvas API — Comparaison pixel par pixel
