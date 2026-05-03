/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cheatsheet/shared', '@cheatsheet/db'],
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
