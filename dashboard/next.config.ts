import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '*',
    '*.loca.lt',
    'lovely-maps-buy.loca.lt',
    '192.168.0.125',
    '192.168.0.125:3000',
    '192.168.137.1',
    '192.168.137.1:3000',
    'localhost:3000'
  ]
};

export default nextConfig;
