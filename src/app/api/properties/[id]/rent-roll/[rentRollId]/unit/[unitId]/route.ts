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

    // TODO: Implement rent roll reconciliation logic.
    // This endpoint currently fetches the tenancy associated with a specific rent roll.
    // In the future, we will need a mechanism to match provisional leases (leases without a tenancy)
    // with new tenancies that appear in future rent roll uploads. This could be a user-driven
    // matching process or some automated logic based on dates and unit numbers.

    try {
        const unitWithLeases = await prisma.unit.findFirst({
            where: {
                id: unitId,
                propertyId: propertyId,
                property: {
                    ownerId: session.user.id,
                }
            },
            include: {
                leases: {
                    include: {
                        residents: {
                            orderBy: {
                                annualizedIncome: 'desc'
                            },
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
                        tenancy: {
                            include: {
                                rentRoll: true
                            }
                        }
                    }
                }
            }
        });

        if (!unitWithLeases) {
            return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
        }

        // Enhance residents with new fields using raw SQL (temporary workaround)
        for (const lease of unitWithLeases.leases) {
            for (let i = 0; i < lease.residents.length; i++) {
                const residentData = await prisma.$queryRaw<{
                    calculatedAnnualizedIncome: number | null;
                    incomeFinalized: boolean;
                    finalizedAt: Date | null;
                }[]>`
                    SELECT "calculatedAnnualizedIncome", "incomeFinalized", "finalizedAt"
                    FROM "Resident"
                    WHERE "id" = ${lease.residents[i].id}
                `;
                
                if (residentData.length > 0) {
                    (lease.residents[i] as any).calculatedAnnualizedIncome = residentData[0].calculatedAnnualizedIncome;
                    (lease.residents[i] as any).incomeFinalized = residentData[0].incomeFinalized;
                    (lease.residents[i] as any).finalizedAt = residentData[0].finalizedAt;
                }
            }
        }

        // Find the specific tenancy linked to the rent roll
        const tenancyLease = unitWithLeases.leases.find((l: { tenancy: { rentRollId: string; } | null; }) => l.tenancy?.rentRollId === rentRollId);
        const tenancy = tenancyLease ? {
            id: tenancyLease.tenancy?.id,
            lease: tenancyLease,
            unit: unitWithLeases,
            rentRoll: tenancyLease.tenancy?.rentRoll,
        } : null;

        if (!tenancy) {
            return NextResponse.json({ error: 'Tenancy for this rent roll not found' }, { status: 404 });
        }

        return NextResponse.json(tenancy);

    } catch (error) {
        console.error('Error fetching tenancy details:', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 