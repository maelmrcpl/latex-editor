# SynTeX — Fonctionnalités visibles

Inventaire de tout ce que l'utilisateur doit pouvoir voir et faire sur le site, écran par écran.
Ce document décrit uniquement le **quoi** (contenus, actions, états, messages). Il ne dit rien du **comment** (couleurs, typographie, icônes, disposition visuelle, animations) : ces choix relèvent de la refonte du design.

SynTeX est un éditeur LaTeX en ligne, auto-hébergé. La compilation se fait entièrement dans le navigateur (WebAssembly). L'interface est en français.

---

## 0. Navigation générale

| Écran | Adresse | Qui y accède |
|---|---|---|
| Chargement initial | — | Tout le monde, le temps de vérifier la session |
| Connexion | `/` (non connecté) | Visiteur non connecté |
| Compte en attente / refusé | `/` (connecté, non validé) | Utilisateur pas encore validé ou refusé |
| Tableau de bord des projets | `#/` | Utilisateur validé |
| Espace de travail d'un projet | `#/project/<id>` | Utilisateur validé (ses projets ; un admin voit tous les projets) |
| Gestion des utilisateurs | `#/admin` | Administrateurs uniquement |

- Les adresses `#/project/<id>` et `#/admin` sont partageables et rechargeables (retour direct sur l'écran).
- Les boutons Précédent / Suivant du navigateur fonctionnent entre ces écrans.

### Écran de chargement initial
- Message « Initialisation... » avec indicateur d'activité, affiché pendant la vérification de la session.

---

## 1. Écran de connexion

**Contenu**
- Logo / nom **SynTeX** avec son slogan (« L'éditeur LaTeX collaboratif »).
- Texte explicatif : la connexion se fait avec un compte Google, et les nouveaux comptes doivent être validés par l'administrateur.
- Bouton **« Continuer avec Google »** (seul moyen de connexion, aucun mot de passe).
- Mention « Accès sur validation ».
- Mention technique « SynTeX • WASM ».

**États**
- Si la connexion Google n'est pas configurée sur le serveur : le bouton est désactivé et un message d'erreur l'explique.
- Message d'erreur affiché au retour de Google en cas d'échec :
  - connexion non configurée sur le serveur ;
  - tentative expirée ou invalide ;
  - connexion annulée par l'utilisateur ;
  - Google a refusé la connexion ;
  - réponse de Google invalide ;
  - adresse email du compte Google non vérifiée ;
  - domaine email non autorisé à s'inscrire ;
  - erreur générique « Connexion impossible ».

---

## 2. Écran « Compte en attente » / « Accès refusé »

Affiché à un utilisateur connecté dont le compte n'est pas validé.

**Contenu commun**
- Logo / nom SynTeX avec slogan.
- Rappel du compte connecté : photo de profil Google (si disponible) + adresse email.
- Bouton **« Changer de compte »** (déconnexion).

**Variante « En attente »**
- Titre « Compte en attente de validation ».
- Texte : la demande est enregistrée, un administrateur doit la valider.
- Bouton **« Vérifier à nouveau »** : revérifie le statut ; indicateur d'activité pendant la vérification ; si le compte a été validé entre-temps, l'utilisateur accède directement au tableau de bord.

**Variante « Refusé »**
- Titre « Accès refusé ».
- Texte : l'administrateur n'a pas autorisé ce compte.
- Pas de bouton « Vérifier à nouveau ».

---

## 3. Tableau de bord des projets

### 3.1 En-tête
- Logo / nom SynTeX avec slogan.
- Badge de version « v1 • WASM Engine ».
- Utilisateur connecté : photo de profil + nom (email en info-bulle).
- Bouton **« Utilisateurs »** → gestion des utilisateurs (**admins uniquement**).
- Bouton **« Déconnexion »**.

### 3.2 Titre et stockage
- Titre : « Mes Projets LaTeX » (utilisateur) ou « Tous les projets LaTeX » (admin).
- **Jauge de stockage** :
  - libellé « Stockage » (ou « Stockage de tes projets » pour un admin) ;
  - espace utilisé / quota total (ex. « 12 Mo / 500 Mo »), ou « sans limite » si pas de quota (admins, ou quota désactivé) ;
  - barre de progression du remplissage, avec niveaux distincts selon le taux (normal, proche de la limite, dépassé) ;
  - ligne d'information : espace restant + taille maximale par fichier (ex. « 488 Mo disponibles • fichiers jusqu'à 25 Mo ») ;
  - si quota atteint : message d'alerte « Quota atteint : supprime des fichiers ou des projets pour en ajouter ».
- Bouton principal **« Nouveau Projet »**.

### 3.3 Liste des projets
- **Chargement** : message « Chargement des projets... ».
- **Aucun projet** : état vide avec titre « Aucun projet pour le moment », texte d'invitation (« Crée ton premier article scientifique, mémoire ou présentation Beamer ») et boutons **« Créer un projet »** et **« Importer un .zip »**.
- **Recherche** (`Ctrl+K` / `⌘K`) sur le nom, la description et le propriétaire ; **filtre par moteur** ; **tri** : modifiés récemment, nom, date de création. Les projets épinglés restent en tête quel que soit le tri.
- **Importer** : bouton qui crée un projet depuis une archive `.zip` (par exemple un export Overleaf) puis l'ouvre :
  - le nom du projet reprend celui de l'archive ;
  - si tout le contenu est dans un seul dossier, ce dossier est retiré ;
  - le fichier principal est détecté (`.tex` contenant `\documentclass`, en préférant `main.tex` et le moins profond) ;
  - le moteur est deviné (fontspec / polyglossia → XeLaTeX, code Lua → LuaLaTeX, sinon pdfLaTeX) ;
  - les fichiers système et de compilation (`__MACOSX`, `.DS_Store`, `.aux`, `.log`…) sont ignorés ;
  - erreurs affichées : archive illisible, vide, sans `.tex`, trop de fichiers, fichier ou archive trop volumineux, quota dépassé.
- **Grille de cartes projet**, chaque carte affiche :
  - nom du projet ;
  - moteur de compilation (pdflatex / xelatex / lualatex) ;
  - **propriétaire** (nom ou email) — visible uniquement par un admin, pour les projets d'autres utilisateurs ;
  - description, ou « Aucune description » ;
  - date et heure de dernière modification ;
  - nombre de fichiers (« N fich. ») ;
  - action **Épingler / Désépingler** (n'affecte pas la date de modification) ;
  - action **Renommer / modifier la description** (fenêtre avec titre et description) ;
  - action **Dupliquer le projet** : crée « Nom (copie) » avec tous les fichiers, dans le quota de l'utilisateur ;
  - action **Exporter en .zip** (téléchargement du projet complet) ;
  - action **Supprimer le projet** (avec confirmation « Supprimer définitivement le projet "…" ? ») ; la jauge de stockage se met à jour après suppression.
- Cliquer sur une carte ouvre le projet dans l'espace de travail.

### 3.4 Fenêtre « Nouveau Projet LaTeX »
- Champ **Titre du projet** (obligatoire, focus automatique, exemple : « Mémoire Systèmes Distribués »).
- Champ **Description** (optionnelle, exemple : « Notes ou objectif du document... »).
- **Choix du modèle** (un seul sélectionnable, « Article » par défaut), chacun avec titre + sous-titre :
  - **Article Scientifique** — multi-fichiers, théorèmes AMS, équations & BibTeX ;
  - **Rapport / Mémoire (FR)** — chapitres séparés, table des matières & bibliographie ;
  - **Présentation Beamer 16:9** — diaporama académique avec blocs mathématiques ;
  - **Document Minimal** — squelette article vierge.
- **Moteur de compilation par défaut** (liste déroulante) :
  - pdfLaTeX (recommandé — rapide & universel) ;
  - XeLaTeX (Unicode natif) ;
  - LuaLaTeX (scripts Lua & polices modernes).
- Boutons **« Annuler »** et **« Créer et ouvrir »** (libellé « Création... » pendant l'opération). Après création, le projet s'ouvre directement.

---

## 4. Espace de travail d'un projet

Écran plein, organisé en trois zones côte à côte : **panneau latéral** · **éditeur** · **aperçu PDF** (+ tiroir de diagnostics sous l'aperçu).

- Écran de chargement « Ouverture de l'espace de travail... » pendant l'ouverture du projet.
- À l'ouverture, le fichier principal du projet est affiché et une **première compilation est lancée automatiquement**.

### 4.1 Barre supérieure

**Partie gauche**
- **Retour aux projets** : sauvegarde d'abord les modifications ; si la sauvegarde échoue, demande confirmation (« Certaines modifications n'ont pas pu être sauvegardées et seront perdues. Quitter quand même ? »).
- **Afficher / masquer le panneau latéral**.
- Logo SynTeX (version compacte).
- Fil d'Ariane : **nom du projet** / **chemin du fichier ouvert**.
- **Indicateur de sauvegarde**, 4 états :
  - « Sauvegarde... » (en cours) ;
  - « Modifié » (modifications non encore sauvegardées) ;
  - « Non sauvegardé » (la dernière sauvegarde a échoué ; le détail de l'erreur en info-bulle) ;
  - « Sauvegardé ».

**Partie droite**
- **Statut du moteur LaTeX WebAssembly**, avec indicateur d'activité pendant le chargement et la compilation. Messages possibles :
  - « Moteur WASM en veille » / « Prêt » ;
  - « Vérification des assets WebAssembly TeX Live... » ;
  - « Initialisation du moteur LaTeX WebAssembly... » ;
  - « Chargement des paquets TeX Live (NN %)... » (progression) ;
  - « Moteur WASM prêt » ;
  - « Compilation (pdflatex)... » ;
  - « Compilé en 1.23s » / « Erreur de compilation » ;
  - état d'alerte si les fichiers du moteur sont absents du serveur ou si le démarrage a échoué (message explicatif).
- **Sélecteur de moteur** : pdfLaTeX / XeLaTeX / LuaLaTeX (enregistré dans le projet).
- Case à cocher **« Auto »** : compilation automatique ~2 s après la fin de la frappe.
- Bouton **SyncTeX éditeur → PDF** (saute de la ligne courante à l'endroit correspondant du PDF ; désactivé tant qu'aucune donnée SyncTeX n'est disponible ; raccourci `Ctrl+Shift+J`).
- Bouton **Exporter le projet complet (.zip)**.
- Bouton **Sauvegarder** (`Ctrl+S`).
- Bouton **Réglages d'affichage** : thème sombre / clair, taille du texte de l'éditeur (11 à 20 px), retour à la ligne automatique ; mémorisés dans le navigateur.
- Bouton principal **« Compiler »** (`Ctrl+Entrée`), avec indicateur d'activité et désactivé pendant la compilation.

### 4.2 Bandeau d'erreur
Bandeau affiché sous la barre supérieure quand une action échoue, avec la raison et un bouton pour le masquer. Cas couverts :
- sauvegarde impossible (les modifications restent dans l'éditeur) — disparaît automatiquement quand une sauvegarde réussit ;
- compilation impossible ;
- création de fichier impossible ;
- envoi d'un fichier impossible (nom du fichier précisé) ;
- renommage impossible ;
- suppression impossible ;
- changement du fichier principal impossible ;
- changement de moteur impossible ;
- ajout d'une référence bibliographique impossible.

Raisons typiques remontées : quota de stockage atteint, fichier trop volumineux (avec la limite), requête trop volumineuse, nom déjà utilisé, chemin invalide, fichier introuvable, serveur injoignable.

### 4.3 Redimensionnement
- Largeur du panneau latéral ajustable par glisser (entre ~190 et ~420 px).
- Répartition éditeur / aperçu PDF ajustable par glisser (entre 25 % et 75 %).
- Panneau latéral masquable entièrement.

### 4.4 Panneau latéral

Quatre onglets : **Fichiers**, **Plan**, **BibTeX**, **Recherche** (icône loupe).

#### Onglet « Fichiers »
- Titre de section « Arborescence ».
- Bouton **Nouveau fichier** : demande un chemin (ex. `sections/methodologie.tex`, `references.bib`) ; les sous-dossiers sont créés automatiquement ; le fichier créé s'ouvre.
- Bouton **Nouveau dossier** : crée un dossier, éventuellement vide (ex. `figures`, `chapitres/annexes`) ; il est conservé au rechargement et dans l'export `.zip`. Un dossier vide affiche la mention « vide ».
- Bouton **Importer des fichiers ou images** (sélection multiple).
- **Glisser-déposer** de fichiers/images n'importe où sur le panneau, avec retour visuel pendant le survol et mention « Glisser-déposer des images/fichiers ici ».
- **Arborescence** des fichiers et dossiers (dossiers d'abord, puis tri alphabétique) :
  - dossiers repliables / dépliables ;
  - type de fichier reconnaissable : `.tex`, `.bib`, image, autre ;
  - fichier actuellement ouvert mis en évidence ;
  - marqueur **« root »** sur le fichier principal du projet.
- Actions au survol d'un **fichier** :
  - **Définir comme fichier principal (root)** — uniquement pour un `.tex` qui ne l'est pas déjà ;
  - **Renommer** (demande le nouveau chemin / nom ; permet aussi de déplacer) ;
  - **Supprimer** (avec confirmation) — indisponible s'il ne reste qu'un fichier.
- Actions au survol d'un **dossier** : **Nouveau fichier dans ce dossier**, **Nouveau sous-dossier**, **Renommer le dossier**, **Supprimer le dossier** (avec confirmation, supprime son contenu).

#### Onglet « Plan »
- Liste de toutes les divisions du document détectées dans tous les `.tex` du projet : parties, chapitres, sections, sous-sections, sous-sous-sections, hiérarchisées par niveau.
- Chaque entrée affiche le titre et l'emplacement (`fichier:ligne`).
- Cliquer sur une entrée ouvre le fichier et place le curseur sur la ligne.
- État vide : « Aucune section détectée dans le projet ».
- Mise à jour en direct pendant la frappe.

#### Onglet « Recherche » (dans tout le projet)
- Ouverture directe avec `Ctrl+Shift+F` (le panneau latéral s'ouvre si besoin et le champ prend le focus).
- Champ de recherche (2 caractères minimum) et bouton **Respecter la casse**.
- Résumé : « N résultats dans M fichiers » (limité à 500 résultats).
- Résultats groupés par fichier : chemin, nombre de correspondances, puis une ligne par correspondance (numéro de ligne + extrait avec le terme mis en évidence).
- Cliquer sur un résultat (ou `Entrée` dans le champ pour le premier) ouvre le fichier et sélectionne le terme trouvé.

#### Onglet « BibTeX » (recherche bibliographique)
- Champ de recherche : titre, auteur, DOI ou identifiant arXiv (2 caractères minimum).
- Filtre de source : **Tous** / **arXiv** / **Crossref**.
- Bouton **« Chercher »**.
- Chargement : « Interrogation d'arXiv & Crossref... ».
- État vide : explication (« Recherche un article pour l'ajouter automatiquement à `references.bib` et insérer `\cite{...}` »).
- **Carte résultat** :
  - titre de la publication ;
  - source (arXiv ou Crossref) ;
  - 3 premiers auteurs (+ « et al. ») et année ;
  - bouton **« .bib & \cite »** : ajoute l'entrée au fichier `.bib` du projet (crée `references.bib` s'il n'existe pas, pas de doublon) et insère `\cite{clé}` au curseur si un `.tex` est ouvert ; confirmation « Ajouté ! » ;
  - bouton **Copier l'entrée BibTeX** (confirmation visuelle) ;
  - lien **Ouvrir la source** (nouvel onglet), si disponible.

### 4.5 Zone centrale : éditeur

**Fichier texte (`.tex`, `.bib`, etc.)** — éditeur de code :
- numéros de ligne ;
- coloration syntaxique LaTeX et BibTeX ;
- pliage des sections (`\section`…) et des environnements (`\begin…\end`) ;
- mise en évidence de la ligne courante, des correspondances de la sélection et des parenthèses/accolades associées ;
- fermeture automatique des parenthèses, crochets, accolades ;
- retour à la ligne automatique des lignes longues ;
- annuler / rétablir, recherche / remplacement, indentation avec Tab ;
- **erreurs et avertissements de compilation affichés dans la marge**, sur la ligne concernée, avec message au survol.

**Autocomplétion** :
- `\cite{` → clés des entrées des fichiers `.bib` du projet (avec titre) ;
- `\ref{` / `\eqref{` → `\label` définis dans le projet (avec fichier d'origine) ;
- `\input{` / `\include{` → fichiers `.tex` du projet ;
- `\includegraphics{` → images du projet (avec taille) ;
- `\begin{` → environnements courants (equation, align, …) avec insertion automatique du `\end{…}` ;
- `\` → modèles de commandes : section avec label, sous-section, fraction, racine, somme, intégrale, gras, italique, monospace, figure complète avec légende, et symboles mathématiques courants (lettres grecques, ∞, ∂, ∇, ∀, ∃, ∈, ⊂, →, ⇒, ≈, ≠, ≤, ≥, ℝ…).

**Raccourcis clavier** :
- `Ctrl+S` : sauvegarder (et compiler si « Auto » est activé) ;
- `Ctrl+Entrée` : compiler ;
- `Ctrl+Shift+J` : SyncTeX éditeur → PDF ;
- `Ctrl+P` : **ouverture rapide** d'un fichier (liste filtrée par nom ou chemin, recherche approximative, flèches + `Entrée`, `Échap` pour fermer) ; aussi accessible en cliquant sur le chemin du fichier dans la barre supérieure ;
- `Ctrl+Shift+F` : recherche dans tout le projet.

**Fichier binaire** :
- image : aperçu de l'image ;
- autre binaire : type MIME et taille en Ko ;
- rappel de la syntaxe pour l'utiliser : `\includegraphics{chemin}`.

**Barre d'état** sous l'éditeur : nombre de mots estimé du fichier `.tex` ouvert (préambule, commandes et formules exclus) et position du curseur « Ln X, Col Y ».

**Aucun fichier sélectionné** : « Sélectionne un fichier dans l'arborescence ».

**Sauvegarde** :
- sauvegarde automatique ~1,2 s après la fin de la frappe ;
- sauvegarde forcée avant chaque compilation, renommage et retour aux projets ;
- avertissement du navigateur si l'on ferme l'onglet avec des modifications non sauvegardées.

### 4.6 Zone droite : aperçu PDF

**Barre d'outils**
- Zoom arrière / zoom avant (50 % à 260 %) avec affichage du pourcentage.
- Nombre de pages.
- Rappel « Ctrl+Clic → Code » quand SyncTeX est disponible (info-bulle : Ctrl+Clic ou double-clic sur le PDF pour sauter à la ligne LaTeX).
- Indicateur de compilation en cours.
- Bouton **« PDF »** : télécharger le PDF compilé (nommé d'après le projet) ; désactivé tant qu'aucun PDF n'existe.

**Zone de pages**
- Rendu de toutes les pages du PDF, défilement vertical.
- La position de défilement et le zoom sont conservés à chaque recompilation.
- Le dernier PDF valide reste affiché si une compilation échoue.
- **SyncTeX PDF → éditeur** : `Ctrl+Clic` (ou `Cmd+Clic`) ou double-clic sur un endroit du PDF ouvre le bon fichier et sélectionne la ligne source correspondante.
- **SyncTeX éditeur → PDF** : le PDF défile jusqu'à l'endroit correspondant et le **surligne** temporairement.

**États sans PDF**
- Compilation en cours : « Compilation WebAssembly en cours dans le navigateur... ».
- Pas encore compilé : invitation à cliquer sur **Compiler** (ou `Ctrl+Entrée`).

### 4.7 Tiroir « Diagnostics LaTeX » (sous l'aperçu PDF)

- Barre toujours visible, cliquable pour ouvrir / fermer, avec :
  - titre « Diagnostics LaTeX » ;
  - **compteur d'erreurs** ;
  - **compteur d'avertissements**.
- S'ouvre automatiquement quand une compilation échoue.
- Une fois ouvert, deux onglets :
  - **« Problèmes (N) »** : liste des erreurs / avertissements, chacun avec sa gravité, son message et son emplacement `fichier:ligne` ; cliquer ouvre le fichier à la ligne fautive. État vide : « Aucune erreur ni avertissement détecté lors de la dernière compilation ».
  - **« Log complet »** : journal brut de la compilation (ou « Aucun log disponible »).

---

## 5. Gestion des utilisateurs (admins)

### 5.1 En-tête
- Logo / nom SynTeX avec slogan.
- Bouton **« Retour aux projets »**.

### 5.2 Contenu
- Titre « Utilisateurs ».
- Résumé : nombre de demandes d'accès en attente (« N demande(s) d'accès en attente » ou « Aucune demande d'accès en attente »), avec le rappel que les administrateurs se configurent via `ADMIN_EMAILS`.
- Message d'erreur si le chargement ou une action échoue.
- Chargement : « Chargement... ».

### 5.3 Tableau des utilisateurs
Colonnes :
- **Compte** : photo de profil (ou emplacement vide), nom, marqueur **Admin**, mention « (toi) » pour l'utilisateur courant, email ;
- **Statut** : En attente / Validé / Refusé ;
- **Inscription** : date et heure ;
- **Dernière connexion** : date et heure (ou « — ») ;
- **Projets** : nombre de projets ;
- **Stockage** : espace utilisé / quota (ou « sans limite ») + mini-barre de remplissage ;
- **Actions**.

Actions (jamais disponibles sur un compte admin) :
- **Valider** — si le compte n'est pas validé ;
- **Refuser** (compte en attente) / **Révoquer** (compte validé, avec confirmation : « Révoquer l'accès de … ? Ses projets sont conservés. ») ;
- **Remettre en attente** — si le compte est refusé.
- Indicateur d'activité sur la ligne pendant l'action.

---

## 6. Règles métier visibles par l'utilisateur

- Connexion uniquement via Google ; inscription éventuellement restreinte à certains domaines email.
- Tout nouveau compte est **en attente** jusqu'à validation par un admin.
- Un utilisateur ne voit et ne modifie que ses propres projets ; un admin voit tous les projets (avec leur propriétaire).
- Quota de stockage par utilisateur (500 Mo par défaut, réglable, illimité possible ; les admins n'en ont pas).
- Taille maximale par fichier importé (25 Mo par défaut) ; sauvegarde depuis l'éditeur limitée à 5 Mo par fichier.
- Un projet a toujours un **fichier principal** (root) qui sert de point d'entrée à la compilation.
- La compilation gère les projets multi-fichiers, les images, la bibliographie (BibTeX / Biber) et les passes multiples automatiquement.
- Export possible à tout moment : projet complet en `.zip`, ou PDF compilé.

---

## 7. Fonctionnalités prévues (feuille de route)

À anticiper dans la refonte, non encore disponibles :
- **v2 — Assistant IA** contextuel, avec suggestions et modifications proposées en **diff inline** dans l'éditeur (accepter / refuser).
- **v3 — Collaboration temps réel** multi-utilisateurs sur un même document.
