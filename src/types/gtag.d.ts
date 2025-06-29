interface Window {
    gtag: (event: string, action: string, params: Record<string, string | number | boolean>) => void;
    dataLayer: Record<string, unknown>[];
} 