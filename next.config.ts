import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/orders/**": ["./src/lib/pdf/fonts/*.ttf"],
  },
};

export default nextConfig;
