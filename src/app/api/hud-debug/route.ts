// src/app/api/hud-debug/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
    const apiKey = process.env.HUD_API_KEY;
    
    if (!apiKey) {
        return NextResponse.json({ 
            error: 'HUD_API_KEY environment variable not set',
            hasApiKey: false 
        });
    }

    // Test basic HUD API connectivity with a simple request
    try {
        const response = await fetch('https://www.huduser.gov/hudapi/public/fmr/listCounties/TX', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        const responseText = await response.text();
        
        return NextResponse.json({
            hasApiKey: true,
            apiKeyLength: apiKey.length,
            apiKeyStart: apiKey.substring(0, 8) + '...',
            testResponse: {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseText
            }
        });
    } catch (error: any) {
        return NextResponse.json({
            hasApiKey: true,
            apiKeyLength: apiKey.length,
            apiKeyStart: apiKey.substring(0, 8) + '...',
            error: error.message
        });
    }
} 