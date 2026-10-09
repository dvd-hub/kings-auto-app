import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/orders/**": ["./src/lib/pdf/fonts/*.ttf", "./src/lib/pdf/brand/*.png"],
  },
};

export default nextConfig;
