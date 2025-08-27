import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
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

    // Add debugging to identify unit numbers
    console.log(`[UNIT DEBUG] Accessing unit ID: ${unitId}`);

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
                Property: {
                    ownerId: session.user.id,
                }
            },
            include: {
                Lease: {
                    where: {
                        OR: [
                            // Include leases from the current rent roll (current leases)
                            {
                                Tenancy: {
                                    rentRollId: rentRollId
                                }
                            },
                            // Include future leases (no Tenancy record)
                            {
                                Tenancy: null
                            }
                        ]
                    },
                    include: {
                        Resident: {
                            orderBy: {
                                annualizedIncome: 'desc'
                            },
                            include: {
                                IncomeDocument: {
                                    orderBy: {
                                        uploadDate: 'desc'
                                    },
                                    include: {
                                        OverrideRequest: {
                                            select: {
                                                id: true,
                                                status: true,
                                                type: true,
                                                adminNotes: true,
                                                userExplanation: true,
                                                createdAt: true
                                            },
                                            orderBy: {
                                                createdAt: 'desc'
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        IncomeVerification: {
                            orderBy: {
                                createdAt: 'desc'
                            },
                            include: {
                                IncomeDocument: {
                                    orderBy: {
                                        uploadDate: 'desc'
                                    },
                                    include: {
                                        OverrideRequest: {
                                            select: {
                                                id: true,
                                                status: true,
                                                type: true,
                                                adminNotes: true,
                                                userExplanation: true,
                                                createdAt: true
                                            },
                                            orderBy: {
                                                createdAt: 'desc'
                                            }
                                        }
                                    }
                                },
                                OverrideRequest: {
                                    select: {
                                        id: true,
                                        status: true,
                                        type: true,
                                        adminNotes: true,
                                        userExplanation: true,
                                        residentId: true,
                                        createdAt: true
                                    },
                                    orderBy: {
                                        createdAt: 'desc'
                                    }
                                }
                            }
                        },
                        Tenancy: {
                            include: {
                                RentRoll: true
                            }
                        }
                    }
                }
            }
        });

        if (!unitWithLeases) {
            return NextResponse.json({ error: 'Unit not found' }, { status: 404 });
        }

        // Add debugging to show unit number for this ID
        console.log(`[UNIT DEBUG] Unit ID ${unitId} corresponds to Unit Number: ${unitWithLeases.unitNumber}`);
        console.log(`[UNIT DEBUG] Found ${unitWithLeases.Lease.length} leases for unit ${unitWithLeases.unitNumber}:`);
        unitWithLeases.Lease.forEach(lease => {
            const hasCurrentTenancy = lease.Tenancy && lease.Tenancy.rentRollId === rentRollId;
            const isFutureLease = !lease.Tenancy;
            console.log(`[UNIT DEBUG] - Lease "${lease.name}": ${hasCurrentTenancy ? 'CURRENT' : isFutureLease ? 'FUTURE' : 'OTHER'} (${lease.leaseStartDate} to ${lease.leaseEndDate})`);
        });

        // Enhance residents with income finalization data using batched Prisma query
        for (const lease of unitWithLeases.Lease) {
            if (lease.Resident.length > 0) {
                // Batch fetch all resident data in a single query instead of individual queries
                const residentIds = lease.Resident.map(r => r.id);
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
                for (let i = 0; i < lease.Resident.length; i++) {
                    const residentData = residentDataMap[lease.Resident[i].id];
                    
                    if (residentData) {
                        (lease.Resident[i] as any).calculatedAnnualizedIncome = residentData.calculatedAnnualizedIncome;
                        (lease.Resident[i] as any).incomeFinalized = residentData.incomeFinalized;
                        (lease.Resident[i] as any).finalizedAt = residentData.finalizedAt;
                        (lease.Resident[i] as any).hasNoIncome = residentData.hasNoIncome;
                    }
                }
            }
        }

        // Find the specific tenancy linked to the rent roll
        const tenancyLease = unitWithLeases.Lease.find((l: { Tenancy: { rentRollId: string; } | null; }) => l.Tenancy?.rentRollId === rentRollId);
        const tenancy = tenancyLease ? {
            id: tenancyLease.Tenancy?.id,
            lease: tenancyLease,
            unit: unitWithLeases,
            rentRoll: tenancyLease.Tenancy?.RentRoll,
        } : null;

        if (!tenancy) {
            return NextResponse.json({ error: 'Tenancy for this rent roll not found' }, { status: 404 });
        }

        // Explicitly convert Prisma Decimal fields to numbers for proper frontend calculation
        // Convert for ALL leases in the unit (including future leases), not just the tenancy lease
        if (unitWithLeases.Lease) {
            unitWithLeases.Lease = unitWithLeases.Lease.map((lease: any) => ({
                ...lease,
                Resident: lease.Resident ? lease.Resident.map((resident: any) => ({
                    ...resident,
                    calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome ? Number(resident.calculatedAnnualizedIncome) : null,
                    verifiedIncome: resident.verifiedIncome ? Number(resident.verifiedIncome) : null,
                    annualizedIncome: resident.annualizedIncome ? Number(resident.annualizedIncome) : null,
                })) : [],
                IncomeVerification: lease.IncomeVerification ? lease.IncomeVerification.map((verification: any) => ({
                    ...verification,
                    calculatedVerifiedIncome: verification.calculatedVerifiedIncome ? Number(verification.calculatedVerifiedIncome) : null,
                })) : []
            }));
        }

        // Also convert for the specific tenancy lease (for backward compatibility)
        if (tenancy?.lease?.Resident) {
            tenancy.lease.Resident = tenancy.lease.Resident.map((resident: any) => ({
                ...resident,
                calculatedAnnualizedIncome: resident.calculatedAnnualizedIncome ? Number(resident.calculatedAnnualizedIncome) : null,
                verifiedIncome: resident.verifiedIncome ? Number(resident.verifiedIncome) : null,
                annualizedIncome: resident.annualizedIncome ? Number(resident.annualizedIncome) : null,
            }));
        }

        if (tenancy?.lease?.IncomeVerification) {
            tenancy.lease.IncomeVerification = tenancy.lease.IncomeVerification.map((verification: any) => ({
                ...verification,
                calculatedVerifiedIncome: verification.calculatedVerifiedIncome ? Number(verification.calculatedVerifiedIncome) : null,
            }));
        }

        return NextResponse.json(tenancy);

    } catch (error) {
        console.error('Error fetching tenancy details:', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
} 