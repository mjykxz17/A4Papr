/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cheatsheet/shared', '@cheatsheet/db'],
  experimental: {
    typedRoutes: false,
  },
  // Workspace packages use NodeNext-style `.js` extensions in TS imports.
  // Webpack's default resolver doesn't strip them; this alias maps `.js`
  // back to `.ts`/`.tsx` so the bundler can find the source.
  webpack(config) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
