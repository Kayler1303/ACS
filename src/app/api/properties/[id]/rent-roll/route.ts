import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import Papa from 'papaparse';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const propertyId = params.id;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const property = await prisma.property.findFirst({
    where: { id: propertyId, ownerId: session.user.id },
    include: { units: true }, // Eager load units to validate against
  });

  if (!property) {
    return NextResponse.json({ error: 'Property not found or access denied' }, { status: 404 });
  }

  if (property.units.length === 0) {
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
    
    const parseResult = await new Promise<Papa.ParseResult<any>>((resolve, reject) => {
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
    
    await prisma.$transaction(async (tx) => {
      const rentRoll = await tx.rentRoll.create({
        data: {
          propertyId,
          date: new Date(date),
        },
      });

      for (const row of parseResult.data) {
        const unitNumber = row.unitNumber?.trim();
        if (!unitNumber) continue;

        const unit = property.units.find(u => u.unitNumber === unitNumber);

        if (unit) {
          await tx.tenancy.create({
            data: {
              rentRollId: rentRoll.id,
              unitId: unit.id,
              residentName: row.residentName || null,
              leaseRent: row.leaseRent ? parseFloat(row.leaseRent) : null,
              annualizedIncome: row.annualizedIncome ? parseFloat(row.annualizedIncome) : null,
            },
          });
        }
      }
    });

    return NextResponse.json({
      message: 'Rent roll snapshot processed successfully.',
      unitsProcessed: parseResult.data.length,
    });

  } catch (error) {
    console.error('Rent roll processing error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
} 