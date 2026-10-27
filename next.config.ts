import type { NextConfig } from "next";

const storageEndpoint = process.env.S3_ENDPOINT;
const storageUrl = storageEndpoint ? new URL(storageEndpoint) : null;

const nextConfig: NextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "@vercel/sandbox"],
  outputFileTracingIncludes: {
    "/api/projects/**": ["./ai/design/library/images/**/*"],
    "/api/projects/**/chat": ["./node_modules/@sparticuz/chromium/bin/**/*"],
  },
  turbopack: {
    rules: {
      '*.md': {
        loaders: ['raw-loader'],
        as: '*.js',
      },
    },
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      ...(storageUrl
        ? [
          {
            protocol: storageUrl.protocol.slice(0, -1) as "http" | "https",
            hostname: storageUrl.hostname,
            port: storageUrl.port,
            pathname: `${storageUrl.pathname.replace(/\/$/, "")}/**`,
          },
        ]
        : []),
    ],
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

};

export default nextConfig;
