import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('🔍 [CLEANUP API] Starting cleanup of stuck PROCESSING documents...');
    
    // Find documents stuck in PROCESSING for more than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const stuckDocuments = await prisma.incomeDocument.findMany({
      where: {
        status: 'PROCESSING',
        uploadDate: {
          lt: fiveMinutesAgo
        }
      },
      select: {
        id: true,
        documentType: true,
        uploadDate: true,
        Resident: { select: { name: true } }
      }
    });
    
    console.log(`📄 [CLEANUP API] Found ${stuckDocuments.length} stuck documents`);
    
    if (stuckDocuments.length === 0) {
      return NextResponse.json({ 
        message: 'No stuck documents found', 
        fixed: 0 
      });
    }
    
    // Update stuck documents to NEEDS_REVIEW status
    const result = await prisma.incomeDocument.updateMany({
      where: {
        status: 'PROCESSING',
        uploadDate: {
          lt: fiveMinutesAgo
        }
      },
      data: {
        status: 'NEEDS_REVIEW'
      }
    });
    
    console.log(`✅ [CLEANUP API] Fixed ${result.count} stuck documents - marked as NEEDS_REVIEW`);
    
    return NextResponse.json({
      message: `Fixed ${result.count} stuck documents`,
      fixed: result.count,
      documents: stuckDocuments.map(doc => ({
        id: doc.id.substring(0, 8),
        type: doc.documentType,
        resident: doc.Resident?.name,
        uploadDate: doc.uploadDate
      }))
    });
    
  } catch (error) {
    console.error('❌ [CLEANUP API] Error during cleanup:', error);
    return NextResponse.json({ 
      error: 'Failed to cleanup stuck documents' 
    }, { status: 500 });
  }
} 