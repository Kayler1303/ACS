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
                            include: {
                                incomeDocuments: {
                                    orderBy: {
                                        uploadDate: 'desc'
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

        // Enhance residents with income finalization data using batched Prisma query
        for (const lease of unitWithLeases.leases) {
            if (lease.residents.length > 0) {
                // Batch fetch all resident data in a single query instead of individual queries
                const residentIds = lease.residents.map(r => r.id);
                const residentDataMap = await prisma.resident.findMany({
                    where: { id: { in: residentIds } },
                    select: {
                        id: true,
                        annualizedIncome: true,
                        calculatedAnnualizedIncome: true,
                        incomeFinalized: true,
                        finalizedAt: true,
                        hasNoIncome: true
                    }
                }).then(results => 
                    results.reduce((map, resident) => {
                        map[resident.id] = resident;
                        return map;
                    }, {} as Record<string, any>)
                );

                // Apply the data to each resident
                for (let i = 0; i < lease.residents.length; i++) {
                    const residentData = residentDataMap[lease.residents[i].id];
                    
                    if (residentData) {
                        (lease.residents[i] as any).calculatedAnnualizedIncome = residentData.calculatedAnnualizedIncome;
                        (lease.residents[i] as any).incomeFinalized = residentData.incomeFinalized;
                        (lease.residents[i] as any).finalizedAt = residentData.finalizedAt;
                        (lease.residents[i] as any).hasNoIncome = residentData.hasNoIncome;
                    }
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