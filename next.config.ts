import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/orders/**": ["./src/lib/pdf/fonts/*.ttf", "./src/lib/pdf/brand/*.png"],
    "/e/**": ["./src/lib/pdf/fonts/*.ttf", "./src/lib/pdf/brand/*"],
  },
  async headers() {
    return [{ source: "/e/:path*", headers: [
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store, max-age=0" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ] }];
  },
};

export default nextConfig;
