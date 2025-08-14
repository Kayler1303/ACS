import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import * as xlsx from 'node-xlsx';
import { IndividualResidentData } from '@/types/compliance';

// This function now intelligently finds the header row before parsing.
async function findAndParse(rows: any[][], unitKeywords: string[]): Promise<any[]> {
  let headerRowIndex = -1;
  let header: string[] = [];

  // 1. Find the header row in the first 15 rows
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map(cell => String(cell || '').toLowerCase().trim());
    const isHeader = row.some(cell => unitKeywords.includes(cell));

    if (isHeader) {
      headerRowIndex = i;
      header = rows[i].map((h: any) => String(h || '').toLowerCase().trim());
      break;
    }
  }

  if (headerRowIndex === -1) {
    // If no header is found, we can't proceed.
    return []; 
  }

  // 2. Extract data rows and convert to standardized JSON
  const dataRows = rows.slice(headerRowIndex + 1);
  const jsonData = dataRows.map(row => {
    const rowData: { [key: string]: any } = {};
    header.forEach((key: string, index: number) => {
      rowData[key] = row[index];
    });
    return rowData;
  });

  return jsonData;
}


function mapAndProcessData(data: any[], fileType: 'resident' | 'rentRoll'): IndividualResidentData[] {
  const headerMapping = {
    unit: ['unit', 'units', 'unit number', 'unit #', 'unit no', 'bldg/unit', 'unit id', 'contact #', 'apartment', 'apartments'],
    resident: ['resident', 'residents', 'resident name', 'tenant', 'tenants', 'tenant name', 'name'],
    firstName: ['first name', 'firstname'],
    lastName: ['last name', 'lastname'],
    rent: ['rent', 'lease rent', 'monthly rent', 'rent amount', 'current rent', 'market rent', 'actual rent', 'total rent'],
    income: ['income', 'revenue'],
    leaseStartDate: ['lease start', 'lease start date', 'start date', 'move in', 'move-in date'],
    leaseEndDate: ['lease end', 'lease end date', 'end date', 'move out', 'move-out date'],
  };
  
  const getMappedKey = (header: string): string | null => {
    header = header.toLowerCase().trim();
    for (const key of ['unit', 'resident', 'firstName', 'lastName', 'rent', 'leaseStartDate', 'leaseEndDate']) {
        if ((headerMapping as any)[key].includes(header)) {
            return key;
        }
    }
    if (headerMapping.income.some(keyword => header.includes(keyword))) {
        return 'income_source';
    }
    return null;
  };

  return data.map(row => {
    const newRow: Partial<IndividualResidentData> = {};
    let totalIncome = 0;
    let firstName = '';
    let lastName = '';
    
    for (const rawHeader in row) {
      const mappedKey = getMappedKey(rawHeader);
      const value = String(row[rawHeader] || '').trim();

      if (!mappedKey || !value) continue;

      switch (mappedKey) {
        case 'unit':
            newRow.unit = value;
            break;
        case 'rent':
            const rentValue = parseFloat(value.replace(/[^0-9.-]+/g,""));
            if (!isNaN(rentValue)) {
                newRow.rent = rentValue;
            }
            break;
        case 'resident':
            newRow.resident = value;
            break;
        case 'firstName':
            firstName = value;
            break;
        case 'lastName':
            lastName = value;
            break;
        case 'leaseStartDate':
            newRow.leaseStartDate = value;
            break;
        case 'leaseEndDate':
            newRow.leaseEndDate = value;
            break;
        case 'income_source':
            const incomeValue = parseFloat(value.replace(/[^0-9.-]+/g,""));
            if (!isNaN(incomeValue)) {
                totalIncome += incomeValue;
            }
            break;
      }
    }

    if (fileType === 'resident') {
        if (firstName || lastName) {
            newRow.resident = `${firstName} ${lastName}`.trim();
        }
        newRow.totalIncome = totalIncome;
    }

    return newRow as IndividualResidentData;
  }).filter(row => row.unit);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  if (!propertyId) {
    return NextResponse.json({ error: 'Property ID is required' }, { status: 400 });
  }

  try {
    const property = await prisma.property.findFirst({
      where: { id: propertyId, ownerId: session.user.id },
    });

    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileType = formData.get('fileType') as 'resident' | 'rentRoll';

    if (!file || !fileType) {
      return NextResponse.json({ error: 'File or fileType missing' }, { status: 400 });
    }
    
    // Read the raw rows from the excel file first
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // node-xlsx supports both .xls and .xlsx formats
    const workSheets = xlsx.parse(buffer);
    
    if (!workSheets || workSheets.length === 0 || !workSheets[0].data || workSheets[0].data.length === 0) {
      return NextResponse.json({ 
        error: 'No data found in the Excel file. Please ensure the file contains data.' 
      }, { status: 400 });
    }
    
    // Get the first worksheet data
    const processedRows: any[][] = workSheets[0].data.map((row: any[]) => 
      row.map((cell: any) => cell === null || cell === undefined ? '' : cell)
    );

    // Now, intelligently find the headers and parse the data
    const unitKeywords = ['unit', 'units', 'unit number', 'unit #', 'unit no', 'bldg/unit', 'unit id', 'contact #', 'apartment', 'apartments'];
    const rawData = await findAndParse(processedRows, unitKeywords);
    
    if (rawData.length === 0) {
        return NextResponse.json({ error: "Could not find a valid header row containing a 'Unit' column in the first 15 rows of the file." }, { status: 400 });
    }
    
    const processedData = mapAndProcessData(rawData, fileType);
    
    // The rest of the validation remains the same...
    const firstRow = processedData[0];
    if (!firstRow || !firstRow.unit) {
        const detectedHeaders = rawData.length > 0 ? Object.keys(rawData[0]) : [];
        const errorMessage = `Could not find a 'Unit' column in the file. Detected headers: [${detectedHeaders.join(', ')}]. Please ensure the file contains a column with a valid header (e.g., 'Unit', 'Apartment').`;
        return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    if (fileType === 'resident' && !firstRow.resident) {
        return NextResponse.json({ error: "Could not find a 'Resident' or 'Tenant' or 'Name' column in the resident file." }, { status: 400 });
    }
    if (fileType === 'rentRoll' && !firstRow.rent) {
        return NextResponse.json({ error: "Could not find a 'Rent' or 'Lease Rent' column in the rent roll file." }, { status: 400 });
    }

    return NextResponse.json(processedData);

  } catch (error: unknown) {
    console.error('Error processing file:', error);
    return NextResponse.json({ error: (error instanceof Error ? error.message : 'An unexpected error occurred.') }, { status: 500 });
  }
} 