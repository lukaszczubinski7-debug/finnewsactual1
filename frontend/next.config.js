/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    proxyTimeout: 120000,
  },
};

module.exports = nextConfig;
