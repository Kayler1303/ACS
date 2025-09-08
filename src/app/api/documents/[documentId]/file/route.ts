import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readFile } from 'fs/promises';
import path from 'path';

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

    // Check if we're in a serverless environment (Vercel)
    const isServerless = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    if (isServerless) {
      console.error(`[FILE SERVING] Serverless environment detected. File storage not implemented.`);
      console.error(`[FILE SERVING] Document ID: ${documentId}, File Path: ${document.filePath}`);
      console.error(`[FILE SERVING] Current working directory: ${process.cwd()}`);
      
      return NextResponse.json({ 
        error: 'File viewing not available in production environment. Cloud storage implementation required.',
        details: {
          environment: 'serverless',
          documentId,
          filePath: document.filePath,
          message: 'This feature requires cloud storage integration (Azure Blob, AWS S3, etc.)'
        }
      }, { status: 501 }); // 501 Not Implemented
    }

    // Read the file from uploads directory (local development only)
    const filePath = path.join(process.cwd(), 'uploads', document.filePath);
    
    try {
      console.log(`[FILE SERVING] Attempting to read file: ${filePath}`);
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

      console.log(`[FILE SERVING] Successfully serving file: ${document.filePath}`);
      return new NextResponse(fileBuffer, {
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${document.filePath}"`,
        },
      });
    } catch (fileError: any) {
      console.error(`[FILE SERVING] Error reading file from ${filePath}:`, fileError);
      console.error(`[FILE SERVING] File exists check and directory listing needed`);
      
      return NextResponse.json({ 
        error: 'File not found on disk',
        details: {
          filePath: document.filePath,
          fullPath: filePath,
          error: fileError?.message || 'Unknown file error',
          cwd: process.cwd()
        }
      }, { status: 404 });
    }

  } catch (error) {
    console.error('Error serving document file:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 