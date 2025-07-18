import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { readFile } from 'fs/promises';

// TODO: Replace with your project details from the Google Cloud Console.
const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'your-gcp-project-id';
const location = process.env.GOOGLE_CLOUD_LOCATION || 'us'; // e.g., 'us' or 'eu'
// The processor ID can be found in the Document AI section of the Google Cloud Console
const processorId = process.env.GOOGLE_CLOUD_PROCESSOR_ID || 'your-processor-id'; 

const client = new DocumentProcessorServiceClient();

/**
 * Analyzes a document using Google Cloud Document AI.
 * @param filePath The path to the document file.
 * @returns The processed document object from the Document AI API.
 */
export async function analyzeDocument(filePath: string) {
  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  try {
    // Read the file into a base64-encoded string.
    const fileBuffer = await readFile(filePath);
    const encodedImage = fileBuffer.toString('base64');

    const request = {
      name,
      rawDocument: {
        content: encodedImage,
        // This should be dynamically determined based on the file,
        // but we'll focus on PDF for now.
        mimeType: 'application/pdf', 
      },
    };

    console.log('Sending request to Document AI...');
    const [result] = await client.processDocument(request);
    console.log('Document AI analysis complete.');

    return result.document;

  } catch (error) {
    console.error('Failed to process document with Document AI:', error);
    throw new Error('Failed to analyze document.');
  }
} 