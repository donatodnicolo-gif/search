// Prod (Vercel): web e API stanno sullo stesso dominio, quindi il path e'
// relativo e non serve CORS (le rewrite di vercel.json mandano /api/* alla
// funzione serverless che monta NestJS).
export const environment = {
  production: true,
  apiUrl: '/api/v1',
};
