<p align="center">
  <img src="apps/web/public/brand/syntex-banner-light.jpg" alt="SynTeX — L'éditeur LaTeX collaboratif" width="420" />
</p>

# SynTeX — L'éditeur LaTeX collaboratif

Éditeur scientifique LaTeX moderne, conçu pour l'auto-hébergement ultra-léger sur homelab.

Contrairement à Overleaf qui exécute TeX Live sur le serveur (plusieurs Go de RAM), **toute la compilation (`pdfLaTeX`, `XeLaTeX`, `LuaLaTeX`, `bibtex8`, `Biber`, `SyncTeX`) tourne en WebAssembly dans un Web Worker du navigateur**. Le serveur Node 24 + SQLite natif consomme **~55–90 Mo de RAM** au repos comme en charge.

---

## Fonctionnalités (v1)

- **Connexion Google avec validation par l'admin** : connexion uniquement via Google (OpenID Connect, Authorization Code + PKCE, aucun mot de passe stocké). Tout le monde peut demander un accès (optionnellement limité à certains domaines via `ALLOWED_EMAIL_DOMAINS`), mais un compte reste **en attente** tant qu'un administrateur (`ADMIN_EMAILS`) ne l'a pas validé depuis le panneau **Utilisateurs**. Chaque utilisateur ne voit que ses projets ; les admins voient tous les projets. Cookies `HttpOnly` / `SameSite=Lax` / `Secure` (auto derrière reverse-proxy HTTPS) et protection CSRF.
- **Éditeur Split-Screen style Prism (CodeMirror 6)** :
  - Coloration syntaxique LaTeX & BibTeX, pliage de sections (`\section`) et d'environnements (`\begin{...}`).
  - Autocomplétion dynamique sur tout le projet : `\cite{...}` (clés `.bib`), `\ref{...}` / `\eqref{...}` (`\label`), `\input{...}`, `\includegraphics{...}` et auto-fermeture `\begin{...}`.
  - Raccourcis : `Ctrl+S` (sauvegarder), `Ctrl+Entrée` (compiler), `Ctrl+Shift+J` (SyncTeX vers le PDF).
- **Compilation WebAssembly & Viewer PDF.js** :
  - Moteur TeX Live 2026 WASM (`texlyre-busytex`) avec multi-fichiers, images binaires, `bibtex8`/`biber` et passes multiples automatiques.
  - Rendu `pdfjs-dist` haute définition conservant la position de scroll et le zoom à chaque recompilation.
  - Panneau de diagnostics parsant les erreurs/warnings LaTeX avec saut direct à la ligne fautive.
- **SyncTeX bidirectionnel** :
  - `Ctrl+Clic` (ou double-clic) sur le PDF → positionne le curseur sur la ligne `.tex` correspondante.
  - Bouton / raccourci SyncTeX dans l'éditeur → scrolle et met en surbrillance la ligne correspondante dans le PDF.
- **Recherche bibliographique intégrée (arXiv & Crossref)** :
  - Recherche en direct par titre, auteur, DOI ou identifiant arXiv, ajout sans doublon à `references.bib` et insertion de `\cite{cle}` en un clic.

---

## Démarrage rapide en développement (Windows / Linux / macOS)

Prérequis : **Node.js >= 22.5** (testé avec Node 24).

```bash
# 1. Installer les dépendances du monorepo
npm install

# 2. Télécharger une seule fois les binaires WebAssembly TeX Live (~BusyTeX dans apps/web/public/core)
npm run setup:wasm

# 3. Configurer la connexion Google (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / ADMIN_EMAILS)
cp .env.example .env

# 4. Lancer le backend (port 3000) et le frontend Vite (port 5173) dans deux terminaux :
npm run dev:server
npm run dev:web
```

Ouvre ensuite `http://localhost:5173`.

### Configurer la connexion Google

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → **Créer des identifiants** → **ID client OAuth** → type **Application Web** (configure l'écran de consentement si demandé, scopes `openid`, `email`, `profile`).
2. **URI de redirection autorisés** : `<PUBLIC_URL>/api/auth/google/callback` — par ex. `http://localhost:5173/api/auth/google/callback` en dev et `https://latex.mondomaine.fr/api/auth/google/callback` en prod.
3. Renseigne `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` et `ADMIN_EMAILS` dans `.env`.

Les emails listés dans `ADMIN_EMAILS` sont admins et validés automatiquement. Les autres comptes apparaissent **En attente** dans le panneau **Utilisateurs** (bouton visible par les admins sur le tableau de bord), où tu peux les valider, les refuser ou révoquer leur accès. Le rôle admin est vérifié contre `ADMIN_EMAILS` à chaque requête : retirer un email de la liste (puis redémarrer le service) lui retire immédiatement le rôle admin, sessions en cours comprises. Le compte reste validé en tant qu'utilisateur ; refuse-le dans le panneau pour lui couper l'accès.

Limites de stockage (réglables dans `.env`) : `MAX_UPLOAD_MB` (taille max d'un fichier déposé, 25 Mo par défaut) et `USER_QUOTA_MB` (espace total des projets d'un utilisateur, 500 Mo par défaut, `0` = illimité, les admins ne sont pas concernés). Les sauvegardes depuis l'éditeur sont limitées à 5 Mo par fichier.

> Migration depuis la version mono-compte : les anciennes sessions sont invalidées et les projets existants sont rattachés au premier administrateur qui se connecte.

---

## Déploiement Homelab : Conteneur LXC Proxmox + FortiGate

### 1. Création du conteneur LXC sur ton NUC Proxmox
- **Template** : Debian 12 ou Ubuntu 24.04 (unprivileged container)
- **Ressources recommandées** : 1 vCPU, **512 Mo à 1 Go de RAM** (largement suffisant, le process Node utilise < 100 Mo), 4–8 Go de disque.

### 2. Installation automatique dans le LXC
Clone ce dépôt dans le conteneur LXC puis exécute :

```bash
chmod +x deploy/lxc/install-lxc.sh
sudo ./deploy/lxc/install-lxc.sh
```

Le script installe Node 24, télécharge les assets WASM BusyTeX (pour qu'ils soient hébergés localement par ton LXC sans dépendre d'Internet par la suite), compile le frontend + backend, te demande l'URL publique, les identifiants OAuth Google et les emails administrateurs (stockés dans `/etc/prism-latex/prism-latex.env`, `chmod 600`) et démarre le service `systemd` `prism-latex.service` sur le port `3000`.

### 3. Configuration Reverse-Proxy FortiGate
- Redirige le flux HTTPS externe vers `http://<IP_DU_LXC>:3000`.
- Active l'injection des en-têtes HTTP standards sur le Virtual Server / Web Proxy FortiGate :
  - `X-Forwarded-For` (IP client enregistrée sur les sessions grâce à `TRUST_PROXY=true`)
  - `X-Forwarded-Proto: https` (active automatiquement l'attribut `Secure` sur le cookie de session `HttpOnly` et l'en-tête HSTS)
- Renseigne l'IP du FortiGate (telle que vue par le LXC) dans `TRUSTED_PROXY_IPS` : les en-têtes `X-Forwarded-*` venant de toute autre IP sont ignorés, ce qui empêche de les falsifier en joignant directement le port `3000`. Idéalement, n'autorise aussi le port `3000` que depuis le FortiGate (pare-feu Proxmox).

Le script vérifie l'intégrité des assets BusyTeX téléchargés grâce aux empreintes SHA-256 de `deploy/busytex-assets.sha256`. Après une mise à jour volontaire de `texlyre-busytex`, régénère ce fichier avec `node scripts/verify-busytex.mjs --write` et commite-le.

---

## Feuille de route

- [x] **v1** : Éditeur split-screen CodeMirror 6, multi-fichiers, compilation WASM client-side, PDF.js + SyncTeX, citations arXiv/Crossref, connexion Google avec validation admin, déploiement LXC.
- [ ] **v2** : Assistant IA contextuel (multi-provider / Ollama) avec suggestions et modifications en **diff inline** (`@codemirror/merge`) façon Prism.
- [ ] **v3** : Collaboration temps réel multi-utilisateurs via CRDT **Yjs** (`y-codemirror.next` + WebSocket léger).

---

## Licence

SynTeX est distribué sous licence **GNU Affero General Public License v3.0 ou ultérieure** (`AGPL-3.0-or-later`) — voir [LICENSE](LICENSE).

Tu peux utiliser, modifier et redistribuer le code librement. Si tu héberges une version **modifiée** accessible à d'autres utilisateurs via le réseau, tu dois leur donner accès au code source de cette version (article 13 de l'AGPL).

Copyright © 2026 Marcepoil Mael.

Le moteur de compilation embarqué [`texlyre-busytex`](https://www.npmjs.com/package/texlyre-busytex) est lui aussi sous AGPL-3.0 ; les autres dépendances (CodeMirror, PDF.js, Hono, React…) sont sous licences permissives compatibles (MIT, Apache-2.0, ISC).
