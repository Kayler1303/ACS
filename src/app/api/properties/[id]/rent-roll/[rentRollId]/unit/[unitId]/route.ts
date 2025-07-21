import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string, rentRollId: string, unitId: string } }) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Workaround for Next.js 15 params bug
    const urlParts = req.nextUrl.pathname.split('/');
    const propertyId = urlParts[3];
    const rentRollId = urlParts[5];
    const unitId = urlParts[7];

    if (!propertyId || !rentRollId || !unitId) {
        return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    try {
        const tenancy = await prisma.tenancy.findFirst({
            where: {
                unitId: unitId,
                rentRollId: rentRollId,
                unit: {
                    propertyId: propertyId,
                    property: {
                        ownerId: session.user.id,
                    }
                }
            },
            include: {
                residents: {
                    orderBy: {
                        annualizedIncome: 'desc'
                    },
                    include: {
                        incomeDocuments: {
                            orderBy: {
                                uploadDate: 'desc'
                            },
                            include: {
                                verification: true
                            }
                        }
                    }
                },
                incomeVerifications: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    include: {
                        incomeDocuments: {
                            orderBy: {
                                uploadDate: 'desc'
                            }
                        }
                    }
                },
                unit: true,
                rentRoll: true, // Include rent roll data with date
            }
        });

        if (!tenancy) {
            return NextResponse.json({ error: 'Tenancy not found' }, { status: 404 });
        }

        return NextResponse.json(tenancy);

    } catch (error) {
        console.error('Error fetching tenancy details:', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 