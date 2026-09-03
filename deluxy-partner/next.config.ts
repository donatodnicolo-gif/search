import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @react-pdf/renderer (PDF delle pro-forma) porta binari e font propri: non va
  // impacchettato dal bundler di Next, si carica come modulo Node esterno.
  serverExternalPackages: ["@react-pdf/renderer"],
};

export default nextConfig;
