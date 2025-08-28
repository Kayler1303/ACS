// Using direct fetch calls instead of SDK for better endpoint control

/**
 * Analyzes an income document (like a W-2 or pay stub) using Azure's pre-built models.
 * @param fileBuffer The buffer of the file to analyze.
 * @returns The analyzed document result.
 */
export async function analyzeIncomeDocument(fileBuffer: Buffer, modelId: string) {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

  if (!endpoint || !key) {
    throw new Error('Azure Document Intelligence credentials are not set.');
  }
  
  console.log(`Using Document Intelligence endpoint: ${endpoint}`);
  console.log(`Model ID: ${modelId}`);
  
  // Use direct fetch instead of SDK since SDK isn't working with our endpoint configuration
  // Debug test confirmed /documentintelligence/documentModels works with 2024-11-30 API
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${modelId}:analyze?api-version=2024-11-30`;
  
  console.log(`Azure analyze URL: ${analyzeUrl}`);

  console.log(`Starting document analysis with model: ${modelId}`);

  // For income documents, use specific prebuilt models:
  // - "prebuilt-tax.us.w2" for W-2 tax forms
  // - "prebuilt-payStub.us" for pay stubs (now supported in v4.0 API!)
  // These models automatically extract the relevant fields for each document type.
  
  try {
    // Start analysis with direct fetch call
    const initialResponse = await fetch(analyzeUrl, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/octet-stream'
      },
      body: fileBuffer
    });

    console.log(`Initial response status: ${initialResponse.status}`);

    if (initialResponse.status !== 202) {
      const errorText = await initialResponse.text();
      throw new Error(`Analysis failed with status ${initialResponse.status}: ${errorText}`);
    }

    // Get operation location from headers
    const operationLocation = initialResponse.headers.get("operation-location");
    if (!operationLocation) {
      throw new Error("No operation location received from Azure");
    }

    console.log(`Operation location: ${operationLocation}`);

    // Extract operation ID from the location header
    const operationMatch = operationLocation.match(/analyzeResults\/([^?]+)/);
    if (!operationMatch) {
      throw new Error("Could not extract operation ID from operation location");
    }
    const operationId = operationMatch[1];

    console.log(`Polling for operation: ${operationId}`);

    // Poll for completion
    let result;
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5-second intervals
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      try {
        const statusUrl = `${endpoint}/documentintelligence/documentModels/${modelId}/analyzeResults/${operationId}?api-version=2024-11-30`;
        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Ocp-Apim-Subscription-Key': key
          }
        });

        console.log(`Status check ${attempts + 1}: ${statusResponse.status}`);

        if (statusResponse.status === 200) {
          const statusBody = await statusResponse.json();
          
          console.log(`Analysis status: ${statusBody.status}`);
          
          if (statusBody.status === "succeeded") {
            result = statusBody;
            break;
          } else if (statusBody.status === "failed") {
            throw new Error(`Analysis failed: ${statusBody.error?.message || 'Unknown error'}`);
          }
          // Continue polling if status is "running" or "notStarted"
        } else {
          const errorText = await statusResponse.text();
          console.error(`Status response error: ${statusResponse.status}`, errorText);
          throw new Error(`Failed to get analysis status: ${statusResponse.status}`);
        }
      } catch (pollError) {
        console.error(`Polling attempt ${attempts + 1} failed:`, pollError);
        throw pollError;
      }
      
      attempts++;
    }

    if (!result) {
      throw new Error("Analysis timed out after 5 minutes");
    }

    console.log("Analysis completed successfully");
    return result;
    
  } catch (error) {
    console.error("Azure Document Intelligence error:", error);
    throw error;
  }
} 