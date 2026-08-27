/**
 * Avvia l'api in locale con le variabili VERE, per provare le rotte sui dati di
 * produzione prima di pubblicare. Il `.env` locale e' un guscio vuoto: qui si
 * legge il DATABASE_URL dal cluster condiviso e si sceglie un JWT_SECRET
 * apposito, perche' il token di prova lo firmiamo noi.
 *
 * ⚠️ Punta al database VERO: quello che si scrive si scrive davvero.
 */
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const riga = fs
  .readFileSync('C:/Users/nicol/app/deluxy-tasks/.env', 'utf8')
  .split(/\r?\n/)
  .find((l) => l.startsWith('DATABASE_URL='));
const u = new URL(riga.slice('DATABASE_URL='.length).trim().replace(/^"|"$/g, ''));

const figlio = spawn('npx', ['nest', 'start'], {
  cwd: 'C:/Users/nicol/app/deluxy-platform-next/api',
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_URL: `postgresql://${u.username}:${u.password}@${u.hostname}:5432/postgres?schema=platform&connection_limit=5`,
    JWT_SECRET: 'segreto-solo-per-la-prova-locale',
    JWT_EXPIRES_IN: '1h',
    PORT: '3399',
    CORS_ORIGINS: 'http://localhost:4200',
  },
});
process.on('SIGINT', () => figlio.kill());
