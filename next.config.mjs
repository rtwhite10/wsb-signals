/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

const config = {
  // In dev, proxy /api/* to the local Python server.
  // In production (Vercel), the Python serverless functions handle /api/* directly.
  ...(isDev && {
    async rewrites() {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:8000/api/:path*",
        },
      ];
    },
  }),
};

export default config;
