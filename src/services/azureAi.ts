import DocumentIntelligence from '@azure-rest/ai-document-intelligence';
import { AzureKeyCredential } from '@azure/core-auth';

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
  
  const credential = new AzureKeyCredential(key);
  
  // Create client with v4.0 API version (required for paystub model)
  const client = DocumentIntelligence(endpoint, credential, {
    apiVersion: "2024-11-30"
  });

  console.log(`Starting document analysis with model: ${modelId}`);

  // For income documents, use specific prebuilt models:
  // - "prebuilt-tax.us.w2" for W-2 tax forms
  // - "prebuilt-payStub.us" for pay stubs (now supported in v4.0 API!)
  // These models automatically extract the relevant fields for each document type.
  
  try {
    const initialResponse = await client
      .path("/documentModels/{modelId}:analyze", modelId)
      .post({
        contentType: "application/octet-stream",
        body: fileBuffer,
        queryParameters: {
          "api-version": "2024-11-30"
        }
      });

    console.log(`Initial response status: ${initialResponse.status}`);

    if (initialResponse.status !== "202") {
      throw new Error(`Analysis failed with status ${initialResponse.status}: ${JSON.stringify(initialResponse.body)}`);
    }

    // Get operation location from headers
    const operationLocation = initialResponse.headers["operation-location"];
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
        const statusResponse = await client
          .path("/documentModels/{modelId}/analyzeResults/{resultId}", modelId, operationId)
          .get({
            queryParameters: {
              "api-version": "2024-11-30"
            }
          });

        console.log(`Status check ${attempts + 1}: ${statusResponse.status}`);

        if (statusResponse.status === "200") {
          const statusBody = statusResponse.body as any;
          
          console.log(`Analysis status: ${statusBody.status}`);
          
          if (statusBody.status === "succeeded") {
            result = statusBody;
            break;
          } else if (statusBody.status === "failed") {
            throw new Error(`Analysis failed: ${statusBody.error?.message || 'Unknown error'}`);
          }
          // Continue polling if status is "running" or "notStarted"
        } else {
          console.error(`Status response error: ${statusResponse.status}`, statusResponse.body);
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