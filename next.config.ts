import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "lh3.googleusercontent.com" }],
  },
  // Las carpetas con "@" son rutas paralelas en Next: la tienda vive en /tienda/[handle] y se publica como /@usuario.
  async rewrites() {
    return [
      { source: "/@:handle", destination: "/tienda/:handle" },
      { source: "/@:handle/p/:id", destination: "/tienda/:handle/p/:id" },
      { source: "/@:handle/vivo", destination: "/tienda/:handle/vivo" },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
