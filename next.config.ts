import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    eslint: {
        // Warning: This allows production builds to successfully complete even if
        // your project has ESLint errors.
        ignoreDuringBuilds: true,
    },
    // Increase body size limit for file uploads
    serverExternalPackages: [],
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'images.unsplash.com',
            },
        ],
    },
    // Add webpack debugging configuration
    webpack: (config, { dev, isServer }) => {
        if (dev) {
            // Disable webpack caching in development
            config.cache = false;
            
            // Add more verbose error reporting
            config.stats = 'verbose';
            
            // Ensure proper module resolution
            config.resolve = {
                ...config.resolve,
                fallback: {
                    ...config.resolve?.fallback,
                },
            };
        }
        return config;
    },
};

export default nextConfig;