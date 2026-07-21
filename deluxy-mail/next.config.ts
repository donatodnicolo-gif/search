import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // imapflow e mailparser sono librerie Node native: non vanno impacchettate dal bundler.
  serverExternalPackages: ['imapflow', 'mailparser', 'nodemailer'],
  experimental: {
    // Gli allegati delle mail passano dalle Server Action come FormData: il
    // default (1 MB) è troppo poco. 20 MB copre gli allegati normali.
    serverActions: { bodySizeLimit: '20mb' },
  },
}

export default nextConfig
