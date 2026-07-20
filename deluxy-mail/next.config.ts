import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // imapflow e mailparser sono librerie Node native: non vanno impacchettate dal bundler.
  serverExternalPackages: ['imapflow', 'mailparser', 'nodemailer'],
}

export default nextConfig
