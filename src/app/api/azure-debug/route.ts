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

    // Test basic Azure connectivity with a simpler endpoint
    try {
        // First try to list available models (simpler test)
        // Document Intelligence API requires /formrecognizer/ path
        // Test different endpoint paths to find the correct one
        const paths = [
            '/documentModels',
            '/formrecognizer/documentModels', 
            '/documentintelligence/documentModels'
        ];
        
        let workingPath = null;
        let testResults: Record<string, any> = {};
        
        for (const path of paths) {
            try {
                const testResponse = await fetch(`${endpoint}${path}?api-version=2024-11-30`, {
                    method: 'GET',
                    headers: { 
                        'Ocp-Apim-Subscription-Key': key
                    }
                });
                const testText = await testResponse.text();
                testResults[path] = {
                    status: testResponse.status,
                    statusText: testResponse.statusText,
                    body: testText.substring(0, 200) + '...'
                };
                if (testResponse.status === 200) {
                    workingPath = path;
                    break;
                }
            } catch (e) {
                testResults[path] = { error: e instanceof Error ? e.message : String(e) };
            }
        }
        
        // Use the primary test for the main response
        const response = await fetch(`${endpoint}/documentModels?api-version=2024-11-30`, {
            method: 'GET',
            headers: { 
                'Ocp-Apim-Subscription-Key': key
            }
        });

        const responseText = await response.text();
        
        // If the first test fails, try with an older API version
        let fallbackTest = null;
        if (response.status === 404) {
            try {
                const fallbackResponse = await fetch(`${endpoint}/formrecognizer/documentModels?api-version=2023-07-31`, {
                    method: 'GET',
                    headers: { 
                        'Ocp-Apim-Subscription-Key': key
                    }
                });
                const fallbackText = await fallbackResponse.text();
                fallbackTest = {
                    status: fallbackResponse.status,
                    statusText: fallbackResponse.statusText,
                    body: fallbackText.substring(0, 200) + '...'
                };
            } catch (e) {
                fallbackTest = { error: 'Fallback test failed' };
            }
        }
        
        return NextResponse.json({
            hasEndpoint: true,
            hasKey: true,
            endpointLength: endpoint.length,
            endpointStart: endpoint.substring(0, 50) + '...',
            keyLength: key.length,
            keyStart: key.substring(0, 8) + '...',
            workingPath,
            pathTests: testResults,
            mainResponse: {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                body: responseText.substring(0, 500) + (responseText.length > 500 ? '...' : '')
            },
            fallbackTest
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
