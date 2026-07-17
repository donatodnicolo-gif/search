// Dev: il web su 4200 parla con l'API su 3000; una sessione parallela usa 4210 → 3010.
const apiPort = window.location.port === '4210' ? 3010 : 3000;

export const environment = {
  production: false,
  apiUrl: `http://localhost:${apiPort}/api/v1`,
};
