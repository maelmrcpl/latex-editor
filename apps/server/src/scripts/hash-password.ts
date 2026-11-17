import { hashPassword } from '../crypto.js';

const password = process.argv[2];
if (!password || password.length < 8) {
  console.error('Usage: npm run hash-password -- "<mot-de-passe-min-8-caracteres>"');
  process.exit(1);
}

const hash = hashPassword(password);
console.log('\nCopie cette ligne dans ton fichier .env :\n');
console.log(`ADMIN_PASSWORD_HASH="${hash}"\n`);
