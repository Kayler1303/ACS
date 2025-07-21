import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { unlink } from 'fs/promises';

export async function DELETE(req: NextRequest, { params }: { params: { id: string, documentId: string } }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id: residentId, documentId } = params;

    if (!residentId || !documentId) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        // 1. Verify ownership and find the document
        const document = await prisma.incomeDocument.findFirst({
            where: {
                id: documentId,
                residentId: residentId,
                resident: {
                    tenancy: {
                        unit: {
                            property: {
                                ownerId: session.user.id,
                            }
                        }
                    }
                }
            },
        });

        if (!document) {
            return NextResponse.json({ error: 'Document not found or you do not have permission to delete it.' }, { status: 404 });
        }

        // 2. Delete the physical file
        try {
            await unlink(document.filePath);
        } catch (fileError: any) {
            if (fileError.code !== 'ENOENT') {
                console.error('Error deleting file, but proceeding with DB record deletion:', fileError);
            }
        }

        // 3. Delete the document record
        await prisma.incomeDocument.delete({
            where: { id: documentId },
        });

        // 4. Check if we need to update verifiedIncome
        const remainingCompletedDocs = await prisma.incomeDocument.count({
            where: {
                residentId: residentId,
                status: 'COMPLETED',
            }
        });

        if (remainingCompletedDocs === 0) {
            await prisma.resident.update({
                where: { id: residentId },
                data: { verifiedIncome: null },
            });
        }

        return NextResponse.json({ message: 'Document deleted successfully.' }, { status: 200 });

    } catch (error) {
        console.error('Error deleting document:', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 