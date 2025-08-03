import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await (prisma.user as any).findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch all override requests with comprehensive related data
    const requests = await (prisma as any).overrideRequest.findMany({
      include: {
        User_OverrideRequest_requesterIdToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            company: true,
          }
        },
        User_OverrideRequest_reviewerIdToUser: {
          select: {
            id: true,
            name: true,
            email: true,
          }
        }
      },
      orderBy: [
        { status: 'asc' }, // PENDING first
        { createdAt: 'desc' }
      ]
    });

    // Enhance each request with contextual data
    const enhancedRequests = await Promise.all(requests.map(async (request: any) => {
      let contextualData: any = {};

      // For property deletion requests
      if (request.type === 'PROPERTY_DELETION' && request.propertyId) {
        const property = await prisma.property.findUnique({
          where: { id: request.propertyId },
          select: { 
            id: true, 
            name: true, 
            address: true,
            numberOfUnits: true,
            county: true,
            state: true
          }
        });
        contextualData.property = property;
      }

      // For all request types, fetch unit and resident info if available
      if (request.unitId) {
        const unit = await prisma.unit.findUnique({
          where: { id: request.unitId },
          include: {
            Property: {
              select: { id: true, name: true, address: true }
            },
            Lease: {
              include: {
                Resident: {
                  select: { id: true, name: true, annualizedIncome: true, verifiedIncome: true }
                },
                IncomeVerification: {
                  include: {
                    IncomeDocument: {
                      include: {
                        Resident: { select: { id: true, name: true } }
                      }
                    }
                  },
                  orderBy: { createdAt: 'desc' },
                  take: 1
                }
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        });
        contextualData.unit = unit;
      }

      // For specific resident requests
      if (request.residentId) {
        const resident = await prisma.resident.findUnique({
          where: { id: request.residentId },
          include: {
            Lease: {
              include: {
                Unit: {
                  include: {
                    Property: { select: { id: true, name: true, address: true } }
                  }
                }
              }
            }
          }
        });
        contextualData.resident = resident;
      }

      // For verification-specific requests
      if (request.verificationId) {
        const verification = await prisma.incomeVerification.findUnique({
          where: { id: request.verificationId },
          include: {
            IncomeDocument: {
              include: {
                Resident: { select: { id: true, name: true } }
              }
            },
            Lease: {
              include: {
                Unit: {
                  include: {
                    Property: { select: { id: true, name: true, address: true } }
                  }
                },
                Resident: true
              }
            }
          }
        });
        contextualData.verification = verification;
      }

      // For document-specific requests (DOCUMENT_REVIEW)
      if (request.documentId) {
        const document = await prisma.incomeDocument.findUnique({
          where: { id: request.documentId },
          include: {
            Resident: { select: { id: true, name: true } },
            IncomeVerification: {
              include: {
                Lease: {
                  include: {
                    Unit: {
                      include: {
                        Property: { select: { id: true, name: true, address: true } }
                      }
                    }
                  }
                }
              }
            }
          }
        });
        contextualData.document = document;
      }

      // Calculate income discrepancy details for INCOME_DISCREPANCY requests
      if (request.type === 'INCOME_DISCREPANCY' && contextualData.unit) {
        const lease = contextualData.unit.Lease[0]; // Most recent lease
        if (lease) {
          const complianceIncome = lease.Resident.reduce((sum: number, r: any) => sum + (r.annualizedIncome || 0), 0);
          const verifiedIncome = lease.Resident.reduce((sum: number, r: any) => sum + (r.verifiedIncome || 0), 0);
          const discrepancy = Math.abs(complianceIncome - verifiedIncome);
          
          contextualData.incomeAnalysis = {
            complianceIncome,
            verifiedIncome,
            discrepancy,
            percentage: complianceIncome > 0 ? ((discrepancy / complianceIncome) * 100) : 0
          };
        }
      }

      return {
        ...request,
        contextualData
      };
    }));

    // Calculate statistics
    const stats = {
      total: requests.length,
      pending: requests.filter((r: any) => r.status === 'PENDING').length,
      approved: requests.filter((r: any) => r.status === 'APPROVED').length,
      denied: requests.filter((r: any) => r.status === 'DENIED').length,
    };

    return NextResponse.json({
      requests: enhancedRequests,
      stats
    });

  } catch (error) {
    console.error('Error fetching override requests:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 