import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';

// Azure Blob Storage configuration
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';

if (!AZURE_STORAGE_CONNECTION_STRING) {
  console.warn('AZURE_STORAGE_CONNECTION_STRING not found. Blob storage will not work.');
}

let blobServiceClient: BlobServiceClient | null = null;
let containerClient: ContainerClient | null = null;

// Initialize blob service client
function initializeBlobService() {
  if (!AZURE_STORAGE_CONNECTION_STRING) {
    throw new Error('Azure Storage connection string not configured');
  }

  if (!blobServiceClient) {
    blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  }

  return { blobServiceClient, containerClient };
}

/**
 * Upload a file buffer to Azure Blob Storage
 */
export async function uploadToBlob(
  fileName: string, 
  buffer: Buffer, 
  contentType: string = 'application/octet-stream'
): Promise<string> {
  try {
    const { containerClient } = initializeBlobService();
    
    if (!containerClient) {
      throw new Error('Container client not initialized');
    }

    // Ensure container exists (private access by default)
    await containerClient.createIfNotExists();

    // Upload the file
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    
    console.log(`[BLOB STORAGE] Uploading file: ${fileName} (${buffer.length} bytes)`);
    
    const uploadResponse = await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
      metadata: {
        uploadedAt: new Date().toISOString(),
        originalSize: buffer.length.toString()
      }
    });

    console.log(`[BLOB STORAGE] Upload successful: ${fileName}, ETag: ${uploadResponse.etag}`);
    
    // Return the blob URL
    return blockBlobClient.url;
  } catch (error: any) {
    console.error(`[BLOB STORAGE] Upload failed for ${fileName}:`, error);
    throw new Error(`Failed to upload file to blob storage: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Download a file from Azure Blob Storage
 */
export async function downloadFromBlob(fileName: string): Promise<Buffer> {
  try {
    const { containerClient } = initializeBlobService();
    
    if (!containerClient) {
      throw new Error('Container client not initialized');
    }

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    
    console.log(`[BLOB STORAGE] Downloading file: ${fileName}`);
    
    const downloadResponse = await blockBlobClient.download();
    
    if (!downloadResponse.readableStreamBody) {
      throw new Error('No readable stream in download response');
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    const stream = downloadResponse.readableStreamBody;
    
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    
    const buffer = Buffer.concat(chunks);
    console.log(`[BLOB STORAGE] Download successful: ${fileName} (${buffer.length} bytes)`);
    
    return buffer;
  } catch (error: any) {
    console.error(`[BLOB STORAGE] Download failed for ${fileName}:`, error);
    throw new Error(`Failed to download file from blob storage: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Get a blob's metadata and properties
 */
export async function getBlobInfo(fileName: string) {
  try {
    const { containerClient } = initializeBlobService();
    
    if (!containerClient) {
      throw new Error('Container client not initialized');
    }

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    const properties = await blockBlobClient.getProperties();
    
    return {
      url: blockBlobClient.url,
      contentType: properties.contentType,
      contentLength: properties.contentLength,
      lastModified: properties.lastModified,
      etag: properties.etag,
      metadata: properties.metadata
    };
  } catch (error: any) {
    console.error(`[BLOB STORAGE] Get blob info failed for ${fileName}:`, error);
    throw new Error(`Failed to get blob info: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Delete a file from Azure Blob Storage
 */
export async function deleteFromBlob(fileName: string): Promise<boolean> {
  try {
    const { containerClient } = initializeBlobService();
    
    if (!containerClient) {
      throw new Error('Container client not initialized');
    }

    const blockBlobClient = containerClient.getBlockBlobClient(fileName);
    
    console.log(`[BLOB STORAGE] Deleting file: ${fileName}`);
    
    const deleteResponse = await blockBlobClient.deleteIfExists();
    
    if (deleteResponse.succeeded) {
      console.log(`[BLOB STORAGE] Delete successful: ${fileName}`);
      return true;
    } else {
      console.log(`[BLOB STORAGE] File not found for deletion: ${fileName}`);
      return false;
    }
  } catch (error: any) {
    console.error(`[BLOB STORAGE] Delete failed for ${fileName}:`, error);
    throw new Error(`Failed to delete file from blob storage: ${error?.message || 'Unknown error'}`);
  }
}

/**
 * Check if blob storage is properly configured
 */
export function isBlobStorageConfigured(): boolean {
  return !!AZURE_STORAGE_CONNECTION_STRING;
}

/**
 * Generate a unique filename for blob storage
 */
export function generateBlobFileName(originalFileName: string, documentId?: string): string {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = originalFileName.split('.').pop() || '';
  
  if (documentId) {
    return `${documentId}-${timestamp}-${randomSuffix}.${extension}`;
  }
  
  return `${timestamp}-${randomSuffix}-${originalFileName}`;
}
