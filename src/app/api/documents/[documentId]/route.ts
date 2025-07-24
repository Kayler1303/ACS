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

  const { documentId } = params;
  if (!documentId) {
    return NextResponse.json({ error: 'Document ID is required' }, { status: 400 });
  }

  try {
    const document = await prisma.incomeDocument.findFirst({
      where: {
        id: documentId,
        verification: {
          lease: {
            unit: {
              property: {
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

    if (document.filePath) {
      await deleteFileLocally(document.filePath);
    }

    await prisma.incomeDocument.delete({
      where: { id: documentId },
    });

    return NextResponse.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 