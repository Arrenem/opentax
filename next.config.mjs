/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['firebase-admin'],
  // OAuth discovery for remote MCP hosts (RFC 9728 / RFC 8414).
  async rewrites() {
    return [
      { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/metadata/protected-resource' },
      { source: '/.well-known/oauth-protected-resource/api/mcp', destination: '/api/oauth/metadata/protected-resource' },
      { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/metadata/authorization-server' },
      { source: '/.well-known/openid-configuration', destination: '/api/oauth/metadata/authorization-server' },
    ];
  },
  transpilePackages: ['@react-pdf/renderer'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
    ],
  },
};

export default nextConfig;
