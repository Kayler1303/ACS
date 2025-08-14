import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true }
    });
    
    if (user?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');

    // Fetch all override requests with comprehensive related data
    // Note: We'll filter by property relationship in the enhancement step
    // since override requests can be related to properties through multiple paths
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
      const contextualData: any = {};

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

    // Filter by property if specified
    let filteredRequests = enhancedRequests;
    if (propertyId) {
      filteredRequests = enhancedRequests.filter((request: any) => {
        // Check direct property relationship (for PROPERTY_DELETION requests)
        if (request.propertyId === propertyId) {
          return true;
        }
        
        // Check contextual data property
        if (request.contextualData?.property?.id === propertyId) {
          return true;
        }
        
        // Check unit -> property relationship
        if (request.contextualData?.unit?.Property?.id === propertyId) {
          return true;
        }
        
        // Check resident -> lease -> unit -> property relationship
        if (request.contextualData?.resident?.Lease?.Unit?.Property?.id === propertyId) {
          return true;
        }
        
        // Check verification -> lease -> unit -> property relationship
        if (request.contextualData?.verification?.Lease?.Unit?.Property?.id === propertyId) {
          return true;
        }
        
        // Check document -> verification -> lease -> unit -> property relationship
        if (request.contextualData?.document?.IncomeVerification?.Lease?.Unit?.Property?.id === propertyId) {
          return true;
        }
        
        return false;
      });
    }

    // Calculate statistics based on filtered results
    const stats = {
      total: filteredRequests.length,
      pending: filteredRequests.filter((r: any) => r.status === 'PENDING').length,
      approved: filteredRequests.filter((r: any) => r.status === 'APPROVED').length,
      denied: filteredRequests.filter((r: any) => r.status === 'DENIED').length,
    };

    return NextResponse.json({
      requests: filteredRequests,
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