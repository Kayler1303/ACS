import { NextResponse } from 'next/server';

export async function GET() {
    const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
    
    if (!endpoint || !key) {
        return NextResponse.json({ 
            error: 'Azure Document Intelligence credentials not set',
            hasEndpoint: !!endpoint,
            hasKey: !!key
        });
    }

    // Test basic Azure connectivity
    try {
        const response = await fetch(`${endpoint}/documentModels/prebuilt-layout:analyze?api-version=2024-11-30`, {
            method: 'POST',
            headers: { 
                'Ocp-Apim-Subscription-Key': key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        const responseText = await response.text();
        
        return NextResponse.json({
            hasEndpoint: true,
            hasKey: true,
            endpointLength: endpoint.length,
            endpointStart: endpoint.substring(0, 30) + '...',
            keyLength: key.length,
            keyStart: key.substring(0, 8) + '...',
            testResponse: {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
            }
        });
    } catch (error: unknown) {
        return NextResponse.json({
            hasEndpoint: true,
            hasKey: true,
            endpointLength: endpoint.length,
            endpointStart: endpoint.substring(0, 30) + '...',
            keyLength: key.length,
            keyStart: key.substring(0, 8) + '...',
            error: error instanceof Error ? error.message : 'An unexpected error occurred'
        });
    }
}
