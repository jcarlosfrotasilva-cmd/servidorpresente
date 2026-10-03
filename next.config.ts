import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O driver pg usa requires dinâmicos (pg-native, sockets) que não podem ser
  // empacotados — em ambientes serverless (Vercel) isso causa erro em runtime.
  serverExternalPackages: ["pg"],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
