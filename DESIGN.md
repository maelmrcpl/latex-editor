---
name: "SynTeX — Atelier Typographique"
description: "Système de design éditorial et technique pour SynTeX, l'éditeur LaTeX collaboratif auto-hébergé avec compilation WebAssembly."
---

## Overview

**SynTeX — Atelier Typographique** allie la rigueur de l'édition scientifique à la précision d'un environnement d'écriture sobre et moderne. Conçu pour les chercheurs, doctorants et ingénieurs francophones, l'interface adopte par défaut un **mode sombre charbon** (`#0C0C0E` / `#131316`) pensé pour de longues sessions dans l'éditeur LaTeX.

Le style s'inscrit dans une approche **Minimaliste / Technique** : surfaces neutres graduées, bordures fines (`#27272D`), typographie sans-serif géométrique et un accent **bleu indigo mesuré** (`#4E5FE3`) réservé aux actions principales et repères actifs.

## Colors

La palette sombre repose sur des neutres charbon/zinc (`#0C0C0E` pour l'éditeur, `#131316` pour les panneaux, `#1B1B1F` pour les éléments surélevés) associés à un accent bleu indigo sobre (`#4E5FE3` avec texte blanc `#FFFFFF` sur les boutons principaux, et `#9AA8FF` pour les repères textuels). Les teintes sémantiques (`success`, `warning`, `error`) restent discrètes et réservées aux états de compilation.

```yaml
colors:
  light:
    primary: "#3B49DF"
    on-primary: "#FFFFFF"
    primary-container: "#E0E4FF"
    on-primary-container: "#1D2142"
    secondary: "#52525B"
    on-secondary: "#FFFFFF"
    secondary-container: "#E4E4E7"
    on-secondary-container: "#18181B"
    tertiary: "#475569"
    on-tertiary: "#FFFFFF"
    tertiary-container: "#E2E8F0"
    on-tertiary-container: "#1E293B"
    error: "#DC2626"
    on-error: "#FFFFFF"
    error-container: "#FEE2E2"
    on-error-container: "#7F1D1D"
    background: "#FAFAFA"
    on-background: "#18181B"
    surface: "#FAFAFA"
    surface-dim: "#E4E4E7"
    surface-bright: "#FFFFFF"
    surface-container-lowest: "#FFFFFF"
    surface-container-low: "#F4F4F5"
    surface-container: "#E4E4E7"
    surface-container-high: "#D4D4D8"
    surface-container-highest: "#C4C4CC"
    on-surface: "#18181B"
    surface-variant: "#E4E4E7"
    on-surface-variant: "#52525B"
    outline: "#71717A"
    outline-variant: "#D4D4D8"
    inverse-surface: "#18181B"
    inverse-on-surface: "#F4F4F5"
    inverse-primary: "#9AA8FF"
    success: "#15803D"
    on-success: "#FFFFFF"
    success-container: "#DCFCE7"
    on-success-container: "#14532D"
    warning: "#B45309"
    on-warning: "#FFFFFF"
    warning-container: "#FEF3C7"
    on-warning-container: "#78350F"
  dark:
    primary: "#4E5FE3"
    on-primary: "#FFFFFF"
    primary-container: "#1D2142"
    on-primary-container: "#9AA8FF"
    secondary: "#A1A1AA"
    on-secondary: "#131316"
    secondary-container: "#27272D"
    on-secondary-container: "#E4E4E7"
    tertiary: "#9AA8FF"
    on-tertiary: "#131316"
    tertiary-container: "#1D2142"
    on-tertiary-container: "#E4E4E7"
    error: "#F87171"
    on-error: "#450A0A"
    error-container: "#7F1D1D"
    on-error-container: "#FEE2E2"
    background: "#0C0C0E"
    on-background: "#E4E4E7"
    surface: "#131316"
    surface-dim: "#0C0C0E"
    surface-bright: "#1B1B1F"
    surface-container-lowest: "#0C0C0E"
    surface-container-low: "#131316"
    surface-container: "#1B1B1F"
    surface-container-high: "#222228"
    surface-container-highest: "#2A2A32"
    on-surface: "#E4E4E7"
    surface-variant: "#27272D"
    on-surface-variant: "#A1A1AA"
    outline: "#71717A"
    outline-variant: "#27272D"
    inverse-surface: "#E4E4E7"
    inverse-on-surface: "#18181B"
    inverse-primary: "#3B49DF"
    success: "#6EE7B7"
    on-success: "#064E3B"
    success-container: "#064E3B"
    on-success-container: "#A7F3D0"
    warning: "#FBBF24"
    on-warning: "#451A03"
    warning-container: "#451A03"
    on-warning-container: "#FDE68A"
```

## Typography

La hiérarchie associe **Afacad Flux** (géométrique, moderne) pour les titres et en-têtes, **Instrument Sans** (néo-grotesque, très lisible) pour les libellés d'interface et textes courants, et **Source Code Pro** pour l'éditeur LaTeX, les clés BibTeX, les emplacements `fichier:ligne` et les raccourcis clavier. Les données chiffrées et compteurs utilisent systématiquement `tabular-nums`.

```yaml
typography:
  display-lg:
    fontFamily: "Afacad Flux"
    fontSize: 36px
    fontWeight: 600
    lineHeight: 44px
    letterSpacing: -0.5px
  display-lg-mobile:
    fontFamily: "Afacad Flux"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 34px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: "Afacad Flux"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 30px
    letterSpacing: -0.25px
  headline-md:
    fontFamily: "Afacad Flux"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.15px
  title-lg:
    fontFamily: "Afacad Flux"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 22px
    letterSpacing: 0px
  title-md:
    fontFamily: "Instrument Sans"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0.1px
  body-lg:
    fontFamily: "Instrument Sans"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0px
  body-md:
    fontFamily: "Instrument Sans"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Instrument Sans"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.1px
  label-lg:
    fontFamily: "Instrument Sans"
    fontSize: 13px
    fontWeight: 600
    lineHeight: 18px
    letterSpacing: 0.1px
  label-md:
    fontFamily: "Instrument Sans"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.2px
  label-sm:
    fontFamily: "Instrument Sans"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.3px
  code-md:
    fontFamily: "Source Code Pro"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0px
  code-sm:
    fontFamily: "Source Code Pro"
    fontSize: 11px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0px
```

## Layout & Spacing

L'application repose sur une grille fluide à pas strict de **4 px / 8 px** :
- **Espace de travail projet** : pleine largeur et hauteur (`min-h-screen`), organisé en 3 zones redimensionnables côte à côte (panneau latéral 190–420 px, éditeur central, aperçu PDF + tiroir de diagnostics en bas à droite) sous une barre supérieure compacte de 48 px.
- **Tableau de bord et administration** : grille fluide centrée (`max-w-6xl`, gouttières de 16 px et marges de page de 24 px) avec cartes de projet alignées sur 3 colonnes sur grand écran, 2 sur tablette et 1 sur mobile.
- **Écrans d'authentification** : carte unique centrée verticalement et horizontalement.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 48px
  page-margin: 24px
```

## Elevation & Depth

La hiérarchie visuelle privilégie les **couches tonales** (`surface-container-low` pour le panneau latéral, `surface-container-lowest` pour la zone d'édition et la feuille PDF, `surface-container` pour les barres d'outils) associées à des **bordures fines à faible contraste** (`outline-variant`). Les ombres portées restent très discrètes et diffuses, réservées uniquement aux modales, menus contextuels et à la feuille PDF simulée dans l'aperçu. Aucun effet de flou d'arrière-plan (`backdrop-blur`) n'est utilisé.

## Shapes

Les rayons d'arrondi sont mesurés et techniques : `4px` pour les badges, puces de statut et boutons compacts de barre d'outils ; `8px` par défaut pour les boutons standards, champs de saisie et éléments d'arborescence ; `12px` pour les cartes de projet et panneaux ; `16px` pour les modales.

```yaml
rounded:
  sm: 4px
  DEFAULT: 8px
  md: 12px
  lg: 16px
  xl: 24px
  full: 9999px
```

## Motion & Micro-interaction

Les transitions sont vives, sobres et fonctionnelles : retour immédiat (`100ms`) sur les boutons, onglets et éléments d'arborescence ; ouverture/fermeture fluide (`220ms`) pour le tiroir de diagnostics et le panneau latéral. Aucune animation décorative ou en boucle.

```yaml
motion:
  state-change:
    duration: 100ms
    delay: 0ms
    timingFunction: ease-out
  surface-enter:
    duration: 220ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
  surface-exit:
    duration: 150ms
    delay: 0ms
    timingFunction: cubic-bezier(0.3, 0, 1, 1)
```

## Voice & Content Strategy

- **Ton** : direct, précis, confraternel (tutoiement sobre cohérent avec « Stockage de tes projets », « Crée ton premier article »), sans jargon superflu ni superlatifs marketing.
- **Casse** : casse de phrase (« Nouveau projet », « Diagnostics LaTeX ») partout, y compris dans les boutons et titres d'onglets.
- **Libellés d'action** : verbes à l'infinitif indiquant le résultat (« Compiler », « Sauvegarder », « Exporter en .zip », « Définir comme root »).
- **États** : messages clairs et actionnables en cas d'erreur, compteurs avec `tabular-nums`, unités françaises (`Mo`, `Ko`, `s`).

## Components

Les composants partagés sont implémentés en React dans `apps/web/src/components/ui/` :

- **Badge** → `Badge` (étiquettes numériques, moteur, `root`, sources), `StatusDot` (pastille de statut)
- **Button** → `Button` (`primary`, `secondary`, `ghost`, `danger`, `success` ; tailles `sm` / `md` / `lg`), `IconButton`
- **Card** → carte « Dernière session » et cartes de la bibliothèque (`ProjectDashboard.tsx`), résultats de citation (`SidebarExplorer.tsx`), carte d'authentification (`AuthCard.tsx`)
- **Cadre applicatif** → `AppShell` : rail latéral (marque, « Nouveau projet », navigation, stockage, compte) des pages Projets et Utilisateurs
- **Tabs** → `Tabs` (onglets horizontaux, avec ou sans icône)
- **Formulaires** → `Field`, `inputClass`
- **Retours d'état** → `Alert`, `Spinner`, `LoadingScreen`, `Meter` (jauge de stockage), `Kbd`, `Avatar`
- **Modales** → `Modal`, et `useDialogs()` (`confirm` / `prompt`) qui remplace `window.confirm` / `window.prompt`
- **Thème** → `ThemeToggle` + `lib/theme.ts` (sombre par défaut, clair mémorisé dans le navigateur)

## Implementation

- **Tokens** : `apps/web/src/styles.css`. Les couleurs sont des variables CSS (`--sx-*`) redéfinies pour le thème clair
  sous `:root[data-theme="light"]`, exposées à Tailwind v4 via `@theme inline` : `bg-surface-container-low`,
  `text-on-surface-variant`, `border-outline-variant`, `bg-primary`, `text-primary-text` (repères textuels `#9AA8FF`)…
  La palette Tailwind par défaut est désactivée (`--color-*: initial`) : seules les couleurs du système existent.
- **Typographie** : utilitaires `text-display-lg`, `text-headline-md`, `text-title-lg`, `text-body-md`, `text-label-sm`,
  `text-code-sm`… (taille, interligne, interlettrage et graisse). Ajouter `font-display` pour Afacad Flux (titres) ;
  Instrument Sans est la police par défaut, `font-mono` = Source Code Pro. Polices auto-hébergées via `@fontsource-variable`
  (la CSP n'autorise que les polices servies par l'application).
- **Espacements** : `p-gutter-xs` … `p-gutter-xl`, `py-section`, `px-page-margin`.
- **Rayons** (échelle Tailwind) : `rounded-sm` = 4 px, `rounded-lg` = 8 px, `rounded-xl` = 12 px, `rounded-2xl` = 16 px,
  `rounded-3xl` = 24 px.
- **Profondeur** : `shadow-overlay` (modales, menus, infobulles de l'éditeur), `shadow-sheet` (feuille PDF). Aucun flou.
- **Mouvement** : `duration-100 ease-out` pour les changements d'état ; `animate-surface-enter`, `ease-enter` (220 ms) et
  `ease-exit` (150 ms) pour le tiroir de diagnostics, le panneau latéral et les modales.
- **Éditeur** : `lib/latexLanguage.ts` (`syntexEditorTheme`, `syntexHighlight`) lit les mêmes variables, y compris
  la coloration syntaxique (`--sx-syntax-*`).
