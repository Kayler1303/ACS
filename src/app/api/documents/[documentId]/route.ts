import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { unlink } from 'fs/promises';

async function deleteFileLocally(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    // If the file doesn't exist, we can ignore the error.
    if ((error as { code?: string })?.code !== 'ENOENT') {
      throw error;
    }
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { documentId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { documentId } = await params;
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    const document = await prisma.incomeDocument.findFirst({
      where: {
        id: documentId,
        IncomeVerification: {
          Lease: {
            Unit: {
              Property: {
                ownerId: session.user.id,
              },
            },
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found or access denied.' }, { status: 404 });
    }

    // Use a transaction to delete both the document and any associated override requests
    await prisma.$transaction(async (tx) => {
      // First, delete any override requests associated with this document
      const deletedOverrideRequests = await tx.overrideRequest.deleteMany({
        where: {
          documentId: documentId,
        },
      });

      console.log(`🧹 Deleted ${deletedOverrideRequests.count} override request(s) for document ${documentId}`);

      // Then delete the document itself
      await tx.incomeDocument.delete({
        where: { id: documentId },
      });
    });

    // Delete the physical file after successful database operations
    if (document.filePath) {
      await deleteFileLocally(document.filePath);
    }

    return NextResponse.json({ message: 'Document and associated override requests deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 