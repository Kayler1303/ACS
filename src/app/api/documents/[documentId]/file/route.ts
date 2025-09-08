import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import path from 'path';
import { downloadFromBlob, isBlobStorageConfigured } from '@/lib/blob-storage';

/**
 * GET: Serve document file for viewing (admin only)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id }
    });

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { documentId } = await params;

    // Get document to find file path
    const document = await prisma.incomeDocument.findUnique({
      where: { id: documentId },
      select: {
        filePath: true,
        documentType: true
      }
    });

    if (!document || !document.filePath) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Try to serve file from Azure Blob Storage first
    if (isBlobStorageConfigured()) {
      try {
        console.log(`[FILE SERVING] Attempting to download from Azure Blob Storage: ${document.filePath}`);
        const fileBuffer = await downloadFromBlob(document.filePath);
        
        // Determine content type based on file extension
        const ext = path.extname(document.filePath).toLowerCase();
        let contentType = 'application/octet-stream';
        
        if (ext === '.pdf') {
          contentType = 'application/pdf';
        } else if (ext === '.jpg' || ext === '.jpeg') {
          contentType = 'image/jpeg';
        } else if (ext === '.png') {
          contentType = 'image/png';
        }

        console.log(`[FILE SERVING] Successfully serving file from blob storage: ${document.filePath}`);
        return new NextResponse(fileBuffer, {
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${document.filePath}"`,
            'Cache-Control': 'private, max-age=3600', // Cache for 1 hour
          },
        });
      } catch (blobError: any) {
        console.error(`[FILE SERVING] Failed to download from blob storage: ${document.filePath}`, blobError);
        // Fall through to try local file system as backup
      }
    }

    // Fallback: Try local file system (for development or legacy files)
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    if (isServerless) {
      // In serverless environment, if blob storage failed, we can't serve the file
      console.error(`[FILE SERVING] Serverless environment - no blob storage available`);
      console.error(`[FILE SERVING] Document ID: ${documentId}, File Path: ${document.filePath}`);
      
      return NextResponse.json({ 
        error: 'File not found in cloud storage',
        details: {
          environment: 'serverless',
          documentId,
          filePath: document.filePath,
          message: 'File may have been uploaded before blob storage was configured, or blob storage is not properly set up.'
        }
      }, { status: 404 });
    }

    // Local development fallback
    const filePath = path.join(process.cwd(), 'uploads', document.filePath);
    
    try {
      console.log(`[FILE SERVING] Fallback: Attempting to read local file: ${filePath}`);
      const fileBuffer = await readFile(filePath);
      
      // Determine content type based on file extension
      const ext = path.extname(document.filePath).toLowerCase();
      let contentType = 'application/octet-stream';
      
      if (ext === '.pdf') {
        contentType = 'application/pdf';
      } else if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === '.png') {
        contentType = 'image/png';
      }

      console.log(`[FILE SERVING] Successfully serving local file: ${document.filePath}`);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${document.filePath}"`,
        },
      });
    } catch (fileError: any) {
      console.error(`[FILE SERVING] Local file not found: ${filePath}`, fileError);
      
      return NextResponse.json({ 
        error: 'File not found',
        details: {
          filePath: document.filePath,
          message: 'File not found in blob storage or local file system',
          blobConfigured: isBlobStorageConfigured(),
          environment: isServerless ? 'serverless' : 'local'
        }
      }, { status: 404 });
    }

  } catch (error) {
    console.error('Error serving document file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 