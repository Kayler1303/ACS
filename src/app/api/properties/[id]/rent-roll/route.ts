import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import Papa from 'papaparse';
import { format } from 'date-fns';
import crypto from 'crypto';

interface RentRollRow {
  unitNumber?: string;
  residentName?: string;
  leaseRent?: string;
  annualizedIncome?: string;
  [key: string]: string | undefined;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: propertyId } = await params;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, ownerId: session.user.id },
    include: { Unit: true }, // Eager load units to validate against
  });

  if (!property) {
    return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
  }

  if (property.Unit.length === 0) {
    return NextResponse.json({ error: 'No units found for this property. Please upload a master unit list first.' }, { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const date = formData.get('date') as string | null;

    if (!file || !date) {
      return NextResponse.json({ error: 'File and date are required.' }, { status: 400 });
    }
    
    if (file.type !== 'text/csv') {
        return NextResponse.json({ error: 'Invalid file type. Please upload a CSV file.' }, { status: 400 });
    }

    const fileText = await file.text();
    
    const parseResult = await new Promise<Papa.ParseResult<RentRollRow>>((resolve, reject) => {
        Papa.parse(fileText, {
          header: true,
          skipEmptyLines: true,
          complete: resolve,
          error: reject,
        });
      });
  
    if (parseResult.errors.length > 0) {
        return NextResponse.json({ error: 'Error parsing CSV file.', details: parseResult.errors }, { status: 400 });
    }

    const requiredHeaders = ['unitNumber', 'residentName', 'leaseRent', 'annualizedIncome'];
    const headers = parseResult.meta.fields;
    if (!headers || !requiredHeaders.every(h => headers.includes(h))) {
        return NextResponse.json({ error: `CSV must include the following headers: ${requiredHeaders.join(', ')}` }, { status: 400 });
    }
    
    const discrepancies: Array<{
      unitNumber: string;
      newIncome: number;
      verifiedIncome: number;
      discrepancy: number;
      leaseId: string;
      residentNames: string[];
    }> = [];

    await prisma.$transaction(async (tx) => {
      const rentRoll = await tx.rentRoll.create({
        data: {
          id: crypto.randomUUID(),
          propertyId,
          uploadDate: new Date(date),
        },
      });

      for (const row of parseResult.data) {
        const unitNumber = row.unitNumber?.trim();
        if (!unitNumber) continue;

        const unit = property.Unit.find(u => u.unitNumber === unitNumber);
        if (!unit) continue;

        // Check for existing verified income in this unit's leases
        const existingLeases = await tx.lease.findMany({
          where: {
            unitId: unit.id,
          },
          include: {
            Resident: {
              where: { incomeFinalized: true }
            },
            IncomeVerification: {
              where: { status: 'FINALIZED' },
              orderBy: { createdAt: 'desc' },
              take: 1
            }
          }
        });

        // Calculate verified income for existing leases
        let verifiedIncome = 0;
        let leaseWithVerifiedIncome = null;
        let residentNames: string[] = [];

        for (const lease of existingLeases) {
          if (lease.Resident.length > 0 && lease.IncomeVerification.length > 0) {
            const totalVerified = lease.Resident.reduce((sum, resident) => {
              return sum + (Number(resident.calculatedAnnualizedIncome) || Number(resident.annualizedIncome) || 0);
            }, 0);
            
            if (totalVerified > 0) {
              verifiedIncome = totalVerified;
              leaseWithVerifiedIncome = lease;
              residentNames = lease.residents.map(r => r.name);
              break;
            }
          }
        }

        // Find or create a lease for this unit for the rent roll period
        let lease = await tx.lease.findFirst({
          where: {
            unitId: unit.id,
            name: { contains: `Rent Roll ${format(new Date(date), 'MM/yyyy')}` }
          }
        });

        if (!lease) {
          // Create a lease for this rent roll period
          lease = await tx.lease.create({
            data: {
              name: `Rent Roll ${format(new Date(date), 'MM/yyyy')} - Unit ${unitNumber}`,
              unitId: unit.id,
              leaseRent: row.leaseRent ? parseFloat(row.leaseRent) : null,
              leaseStartDate: new Date(date),
              leaseEndDate: null, // Rent roll leases are point-in-time snapshots
            }
          });
        }

        // Create the tenancy (links RentRoll to Lease)
        await tx.tenancy.create({
          data: {
            rentRollId: rentRoll.id,
            leaseId: lease.id,
          },
        });

        // Create or update the resident
        if (row.residentName?.trim()) {
          const residentIncome = row.annualizedIncome ? parseFloat(row.annualizedIncome) : 0;
          
          await tx.resident.create({
            data: {
              name: row.residentName.trim(),
              leaseId: lease.id,
              annualizedIncome: residentIncome,
            }
          });

          // Check for income discrepancy
          if (verifiedIncome > 0 && residentIncome > 0) {
            const discrepancy = Math.abs(residentIncome - verifiedIncome);
            
            // If discrepancy is greater than $1, flag it
            if (discrepancy > 1.00) {
              discrepancies.push({
                unitNumber,
                newIncome: residentIncome,
                verifiedIncome,
                discrepancy,
                leaseId: leaseWithVerifiedIncome!.id,
                residentNames
              });

              console.log(`[RENT ROLL DISCREPANCY] Unit ${unitNumber}: New income $${residentIncome} vs Verified $${verifiedIncome} (diff: $${discrepancy})`);
            }
          }
        }
      }
    });

    return NextResponse.json({
      message: 'Rent roll snapshot processed successfully.',
      unitsProcessed: parseResult.data.length,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined
    });

  } catch (error) {
    console.error('Rent roll processing error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 