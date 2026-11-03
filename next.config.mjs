/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const nextConfig = {
  reactStrictMode: true,
  ...(isProd ? { output: 'standalone' } : {}),
  allowedDevOrigins: ['localhost'],
};

export default nextConfig;
