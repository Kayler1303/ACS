import {
  DocumentAnalysisClient,
  AzureKeyCredential,
} from '@azure/ai-form-recognizer';

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
  const client = new DocumentAnalysisClient(endpoint, credential);

  // For income documents, the "prebuilt-income" model is the most appropriate.
  // It automatically classifies the document (e.g., as a W-2 or paystub) and
  // extracts the relevant fields.
  const poller = await client.beginAnalyzeDocument(
    modelId,
    fileBuffer
  );

  const result = await poller.pollUntilDone();

  return result;
} 