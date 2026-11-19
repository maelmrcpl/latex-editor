#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script d'installation / mise à jour pour conteneur LXC Proxmox (Debian/Ubuntu)
# ==============================================================================

APP_DIR="/opt/prism-latex"
DATA_DIR="/var/lib/prism-latex"
CONF_DIR="/etc/prism-latex"
ENV_FILE="${CONF_DIR}/prism-latex.env"
SERVICE_USER="prism-latex"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Exécute ce script en root dans le conteneur LXC."
  exit 1
fi

echo "==> [1/6] Vérification des prérequis système & Node.js 24..."
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg git tar rsync

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 22 ]]; then
  # Dépôt NodeSource ajouté explicitement avec sa clé de signature (pas de script distant exécuté en root)
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -qq
  apt-get install -y -qq nodejs
fi

echo "==> [2/6] Création de l'utilisateur système et des répertoires..."
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${DATA_DIR}" --shell /usr/sbin/nologin "${SERVICE_USER}"
fi

mkdir -p "${APP_DIR}" "${DATA_DIR}" "${CONF_DIR}"

echo "==> [3/6] Copie du code source dans ${APP_DIR}..."
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [[ "${SRC_DIR}" != "${APP_DIR}" ]]; then
  rsync -a --delete --exclude 'node_modules' --exclude 'data' --exclude '.git' "${SRC_DIR}/" "${APP_DIR}/"
fi

cd "${APP_DIR}"

echo "==> [4/6] Installation des dépendances npm, téléchargement BusyTeX WASM & build..."
npm ci
npm run setup:wasm
if ! node scripts/verify-busytex.mjs; then
  echo "Assets BusyTeX corrompus ou modifiés : suppression, relance le script pour les retélécharger."
  rm -rf "${APP_DIR}/apps/web/public/core/busytex"
  exit 1
fi
npm run build

chown -R "${SERVICE_USER}:${SERVICE_USER}" "${DATA_DIR}"
chown -R root:root "${APP_DIR}"

echo "==> [5/6] Configuration de ${ENV_FILE}..."
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Connexion via Google : crée un ID client OAuth (Application Web) dans Google Cloud Console."
  read -r -p "URL publique de l'app (ex. https://latex.mondomaine.fr) : " PUBLIC_URL
  PUBLIC_URL="${PUBLIC_URL%/}"
  echo "   -> URI de redirection à autoriser chez Google : ${PUBLIC_URL}/api/auth/google/callback"
  read -r -p "GOOGLE_CLIENT_ID : " GOOGLE_CLIENT_ID
  read -r -s -p "GOOGLE_CLIENT_SECRET : " GOOGLE_CLIENT_SECRET
  echo ""
  read -r -p "Email(s) Google administrateur(s), séparés par des virgules : " ADMIN_EMAILS
  read -r -p "Domaines email autorisés à s'inscrire (vide = tous) : " ALLOWED_EMAIL_DOMAINS
  read -r -p "IP du reverse-proxy (FortiGate) vue par ce conteneur : " TRUSTED_PROXY_IPS

  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
DATA_DIR=${DATA_DIR}
PUBLIC_URL=${PUBLIC_URL}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}
ADMIN_EMAILS=${ADMIN_EMAILS}
ALLOWED_EMAIL_DOMAINS=${ALLOWED_EMAIL_DOMAINS}
MAX_UPLOAD_MB=25
USER_QUOTA_MB=500
SESSION_TTL_HOURS=168
TRUST_PROXY=true
TRUSTED_PROXY_IPS=${TRUSTED_PROXY_IPS}
FORCE_SECURE_COOKIE=false
EOF
  chmod 600 "${ENV_FILE}"
  echo "Fichier ${ENV_FILE} généré."
else
  echo "Fichier ${ENV_FILE} déjà présent, conservé tel quel."
fi

echo "==> [6/6] Activation du service systemd prism-latex..."
cp "${APP_DIR}/deploy/lxc/prism-latex.service" /etc/systemd/system/prism-latex.service
systemctl daemon-reload
systemctl enable --now prism-latex.service

echo ""
echo "Installation terminée ! Statut : systemctl status prism-latex"
echo "Écoute HTTP sur le port 3000 (prêt derrière ton FortiGate)."
