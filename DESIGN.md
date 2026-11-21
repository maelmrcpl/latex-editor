# SynTeX — Design system

État actuel de l'interface (`apps/web`), relevé dans le code. Ce document décrit ce qui **existe**,
pas une cible : les incohérences connues sont listées à la fin.

- **Stack** : React 19 + Tailwind CSS v4 (`@import "tailwindcss"`, aucune config de thème personnalisée)
- **Icônes** : [lucide-react](https://lucide.dev)
- **Thème** : sombre uniquement (`<html class="dark">`, fonds `zinc-950`). Pas de thème clair.
- **Langue de l'interface** : français, tutoiement (« Connecte-toi », « Crée ton premier article »)

---

## 1. Marque

| Élément | Valeur |
|---|---|
| Nom | **SynTeX** — « Syn » en blanc, « TeX » en violet de marque |
| Slogan | « L'éditeur LaTeX collaboratif » |
| Violet de marque | `#634BFF` (texte « TeX », survol des boutons principaux) |
| Violet profond | `#5236FF` (boutons principaux, halos, ombres) |
| Assets | `public/brand/syntex-mark.png`, `syntex-icon.png`, `syntex-banner-light.jpg`, `syntex-stacked-light.jpg`, `public/favicon.png` |

Composant unique : `SynTeXLogo` (`components/SynTeXLogo.tsx`), 4 variantes :

| Variante | Usage | Taille du logo | Mot-symbole |
|---|---|---|---|
| `full` | En-tête du tableau de bord et du panneau admin | 36 px (`w-9`) + ombre violette | `text-lg font-extrabold` |
| `compact` | En-tête de l'éditeur | 24 px (`w-6`) | `text-sm font-extrabold` |
| `stacked` | Écrans de connexion / attente | 64 px (`w-16`) + ombre violette | `text-2xl font-extrabold` |
| `icon` | Badge d'application | 32 px, `rounded-lg` | — |

Ombre du logo : `drop-shadow-[0_2px_12px_rgba(82,54,255,0.3)]` (full), `…0_4px_20px…0.35` (stacked).

---

## 2. Couleurs

### Neutres (palette Tailwind `zinc`)

| Rôle | Classe | Hex |
|---|---|---|
| Fond de page, éditeur | `bg-zinc-950` | `#09090b` |
| Surfaces (cartes, panneaux, modales) | `bg-zinc-900`, `bg-zinc-900/60`, `/80` | `#18181b` |
| Bordures, séparateurs, survols | `border-zinc-800`, `hover:bg-zinc-800` | `#27272a` |
| Bordures secondaires | `zinc-700` | `#3f3f46` |
| Texte désactivé / numéros de ligne | `text-zinc-600` | `#52525b` |
| Texte tertiaire, métadonnées | `text-zinc-500` | `#71717a` |
| Texte secondaire | `text-zinc-400` | `#a1a1aa` |
| Texte de contrôle | `text-zinc-300` | `#d4d4d8` |
| Texte principal | `text-zinc-100` / `zinc-200` | `#f4f4f5` / `#e4e4e7` |
| Titres | `text-white` | `#ffffff` |

Barre de défilement globale : fine, `rgba(113, 113, 122, 0.4)` sur fond transparent.

### Accents

| Rôle | Couleur |
|---|---|
| Action principale (marque) | `bg-[#5236FF] hover:bg-[#634BFF]`, ombre `shadow-[#5236FF]/25` |
| Action principale (secondaire / historique) | `bg-indigo-600 hover:bg-indigo-500` |
| Sélection, focus, éléments actifs | `indigo-500` (bordures `focus:border-indigo-500`, fond `indigo-500/15`) |
| Texte d'accent (fichier actif, liens) | `indigo-300` / `indigo-400` |
| Survol d'une carte projet | `hover:border-indigo-500/50`, titre `group-hover:text-indigo-300` |

### États et sémantique

| Sens | Texte | Fond | Bordure | Exemples |
|---|---|---|---|---|
| Succès / validé | `emerald-300/400` | `emerald-500/15` | `emerald-500/30` | « Validé », « Sauvegardé », bouton « Valider » (`bg-emerald-600`) |
| Attention / en attente | `amber-300/400` | `amber-500/15` | `amber-500/30` | « En attente », « ● Modifié », avertissements LaTeX, propriétaire d'un projet |
| Erreur / danger | `red-200/300/400` | `red-500/10` | `red-500/30` | Bandeaux d'erreur, « Non sauvegardé », « Refusé », survol de suppression (`hover:bg-red-500/15`) |
| Admin | `amber-400` | — | — | Icône couronne (`Crown`) |

### Jauges de stockage

| Remplissage | Couleur |
|---|---|
| < 80 % | `bg-[#634BFF]` |
| 80–95 % | `bg-amber-400` |
| ≥ 95 % | `bg-red-500` |

Piste : `bg-zinc-800`, hauteur `h-1.5` (tableau de bord) ou `h-1` (panneau admin), `rounded-full`.
Logique dans `lib/format.ts` (`quotaRatio`, `quotaBarColor`).

### Coloration syntaxique LaTeX (`lib/latexLanguage.ts`)

| Élément | Couleur | Style |
|---|---|---|
| Commentaires | `#71717a` | italique |
| Mots-clés (`\begin`, `\end`…) | `#a78bfa` | 600 |
| Titres (`\section`…) | `#38bdf8` | 700 |
| Atomes | `#fbbf24` | |
| Noms de balise / commandes | `#818cf8` | |
| Opérateurs / maths | `#34d399` | |
| Variables | `#6ee7b7` | |
| Nombres | `#f472b6` | |
| Définitions | `#c084fc` | 600 |
| Accolades | `#a1a1aa` | |
| Crochets | `#94a3b8` | |

Thème de l'éditeur : fond `#09090b`, texte `#e4e4e7`, curseur `#818cf8`, sélection `rgba(99,102,241,0.25)`,
gouttière `#09090b` / texte `#52525b` / bordure `#18181b`, ligne active `rgba(39,39,42,0.35)`,
infobulles `#18181b` bordure `#27272a` ombre `0 10px 25px rgba(0,0,0,0.5)`.

---

## 3. Typographie

- **Interface** : police sans-serif système par défaut de Tailwind (aucune webfont chargée).
- **Code** : `"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace`, 13,5 px dans l'éditeur.
  Les polices ne sont pas embarquées : la première installée sur le poste est utilisée.
- **Monospace dans l'UI** (`font-mono`) : chemins de fichiers, moteur de compilation, codes.

| Usage | Taille | Graisse |
|---|---|---|
| Titre de page (« Mes Projets LaTeX », « Utilisateurs ») | `text-2xl` | `font-semibold tracking-tight` |
| Titre de modale | `text-lg` | `font-semibold` |
| Corps, champs, nom de projet | `text-sm` | normal / `font-medium` |
| Texte d'interface courant (boutons, tableaux, menus) | `text-xs` (12 px) — **le plus utilisé** | `font-medium` pour les boutons |
| Métadonnées, aides, légendes | `text-[11px]` | normal |
| Badges, étiquettes (`ROOT`, moteur) | `text-[10px]`, souvent `uppercase font-mono` | normal |

Chiffres alignés (`tabular-nums`) pour les tailles de stockage.

---

## 4. Espacement, formes, profondeur

### Rayons

| Rayon | Usage |
|---|---|
| `rounded` (4 px) | Petits boutons-icônes, badges de code |
| `rounded-lg` (8 px) | **Boutons standards**, boutons d'en-tête, éléments de liste |
| `rounded-xl` (12 px) | Boutons principaux, champs de formulaire, alertes, choix de modèle |
| `rounded-2xl` (16 px) | Cartes projet, modales, carte de connexion, tableau admin |
| `rounded-full` | Avatars, pastilles de statut, jauges, halos |

### Mise en page

- Pages « application » (tableau de bord, admin) : `max-w-6xl mx-auto px-6`, contenu `py-10`.
- En-tête de page : `h-16`, `sticky top-0`, `border-b border-zinc-900`, `bg-zinc-950/80 backdrop-blur`.
- En-tête de l'éditeur : `h-12 px-3`, `border-b border-zinc-800`.
- En-têtes de panneaux (PDF, diagnostics) : `h-10 px-3`.
- Grille des projets : 1 / 2 / 3 colonnes (`md:grid-cols-2 lg:grid-cols-3`), `gap-4`.
- Éditeur : barre latérale redimensionnable (190–420 px, défaut 250), séparation éditeur/PDF
  redimensionnable (25–75 %, défaut 50 %).

### Profondeur

- Cartes : bordure plutôt qu'ombre (`border-zinc-800/80`).
- Modales et carte de connexion : `shadow-2xl`, voile `bg-black/70 backdrop-blur-sm`.
- Carte de connexion : verre dépoli `bg-zinc-900/80 backdrop-blur-xl` + halo de marque
  `bg-[#5236FF]/20 blur-[130px]` derrière.
- Bouton principal de marque : `shadow-lg shadow-[#5236FF]/25`.

---

## 5. Composants

### Boutons

| Type | Classes |
|---|---|
| Principal (marque) | `px-4 py-2.5 rounded-xl bg-[#5236FF] hover:bg-[#634BFF] text-sm font-medium text-white shadow-lg shadow-[#5236FF]/25` |
| Principal compact (« Compiler ») | `px-3.5 py-1.5 rounded-lg bg-[#5236FF] hover:bg-[#634BFF] text-xs text-white` |
| Principal (modale, recherche) | `px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white` |
| Secondaire (en-tête) | `text-xs px-3 py-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-900 text-zinc-300` + icône 14 px |
| Fantôme | `px-4 py-2 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800` |
| Icône | `p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200` |
| Destructif (icône) | `hover:bg-red-500/15 hover:text-red-400` |
| Validation (admin) | `bg-emerald-600 hover:bg-emerald-500 text-white` |
| Connexion Google | `bg-white hover:bg-zinc-100 text-zinc-900 rounded-xl shadow-lg` + logo Google officiel |

Tous les boutons : `transition`, `cursor-pointer`, `disabled:opacity-50`.

### Champs de formulaire

`w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-indigo-500`
Libellé : `text-xs font-medium text-zinc-400 mb-1`.

### Cartes projet

`bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-indigo-500/50 rounded-2xl p-5`,
pied séparé par `border-t border-zinc-800/70` (date, nombre de fichiers, actions).

### Pastilles de statut

`text-[11px] px-2 py-0.5 rounded-full border` + couleurs de la section « États »
(En attente / Validé / Refusé).

### Alertes et bandeaux

- Alerte en bloc : `px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300`.
- Bandeau d'éditeur (pleine largeur, sous l'en-tête) : `px-4 py-2 border-b border-red-500/30 bg-red-500/10 text-xs text-red-200`,
  icône `AlertTriangle`, bouton de fermeture `X`, `role="alert"`.

### Indicateur de sauvegarde (en-tête de l'éditeur)

| État | Rendu |
|---|---|
| En cours | `Loader2` animé + « Sauvegarde... » |
| Échec | `AlertTriangle` + « Non sauvegardé » en `red-400` |
| Modifié | « ● Modifié » en `amber-400` |
| À jour | `CheckCircle2` `emerald-500` + « Sauvegardé » |

### Icônes

- Taille standard : **14 px** (`w-3.5 h-3.5`) dans les boutons et listes ; 16 px (`w-4 h-4`) dans les boutons principaux ;
  12 px (`w-3 h-3`) dans les indicateurs.
- Couleur héritée du texte, ou couleur d'état.

### Animations

- `transition` sur tous les éléments interactifs.
- `animate-spin` sur `Loader2` pour les chargements.
- SyncTeX : surlignage `.synctex-highlight` (pulsation 2,1 s, `ease-out`, s'estompe) dans l'aperçu PDF.

---

## 6. Ton et contenus

- Tutoiement partout, phrases courtes.
- Messages d'erreur : « <action> impossible : <raison du serveur> » (ex. « Sauvegarde impossible (tes modifications
  restent dans l'éditeur) : Quota de stockage dépassé (498 Mo utilisés sur 500 Mo). »).
- Tailles en unités françaises : o, Ko, Mo, Go, virgule décimale (`formatBytes` dans `lib/format.ts`).
- Dates : `Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })` → « 20 nov. 2026, 00:02 ».
- Confirmations destructives via `window.confirm` avec le nom de l'élément (« Supprimer définitivement le projet "X" ? »).

---

## 7. Incohérences connues

1. **Deux couleurs d'action principale** : le violet de marque (`#5236FF`) sur « Nouveau Projet », « Compiler » et
   l'écran d'attente, mais `indigo-600` sur « Créer et ouvrir », « Créer un projet », la recherche de citations et les
   onglets des diagnostics. L'indigo Tailwind (`#4f46e5`) est proche mais pas identique au violet SynTeX.
2. **Pas de tokens** : les couleurs de marque sont écrites en dur (`bg-[#5236FF]`, `text-[#634BFF]`) à plusieurs endroits
   au lieu de variables de thème Tailwind (`@theme { --color-brand: … }`).
3. **Badge « v1 • WASM Engine »** dans l'en-tête du tableau de bord : texte figé, sans lien avec la version réelle.
4. **Polices de code non embarquées** : le rendu de l'éditeur dépend des polices installées sur le poste
   (la CSP n'autorise que les polices servies par l'application).
5. **Textes du modèle d'article en anglais** (« Research Paper », « This paper demonstrates… ») alors que l'interface
   est en français.
6. **Confirmations natives** (`window.confirm` / `window.prompt`) pour la création, le renommage et la suppression,
   au lieu de modales dans le style de l'application.
