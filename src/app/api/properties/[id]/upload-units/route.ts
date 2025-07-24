
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

const HEADER_KEYWORDS = {
  unitNumber: ['unitnumber', 'unit number', 'unit', 'units', 'bldg/unit', 'apartment', 'apartments'],
  squareFootage: ['squarefootage', 'square footage', 'sqft', 'sq. ft.', 'area'],
  bedroomCount: ['bedroomcount', 'bedrooms', 'beds', '# of bedrooms'],
};

async function findHeadersAndParse(rows: any[][]): Promise<any[]> {
  let headerRowIndex = -1;
  const columnMapping: { [key: string]: number } = {};
  const unitNumberKeywords = HEADER_KEYWORDS.unitNumber;

  // 1. Find the header row in the first 15 rows
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map(cell => String(cell || '').toLowerCase().trim());
    const isHeader = row.some(cell => unitNumberKeywords.includes(cell));

    if (isHeader) {
      headerRowIndex = i;
      // 2. Map columns from the located header row
      const headerRow = row;
      Object.keys(HEADER_KEYWORDS).forEach(standardKey => {
        const keywords = HEADER_KEYWORDS[standardKey as keyof typeof HEADER_KEYWORDS];
        const columnIndex = headerRow.findIndex(headerCell => keywords.includes(headerCell));
        if (columnIndex !== -1) {
          columnMapping[standardKey] = columnIndex;
        }
      });
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error('Could not find a header row. Please ensure your file has a header row with a column for unit numbers (e.g., "Unit", "Unit Number").');
  }

  // 3. Extract data rows and convert to standardized JSON
  const dataRows = rows.slice(headerRowIndex + 1);
  const jsonData = dataRows.map(row => {
    const obj: { [key: string]: any } = {};
    Object.keys(columnMapping).forEach(key => {
      obj[key] = row[columnMapping[key]];
    });
    return obj;
  });

  return jsonData;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const propertyId = params.id;

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const property = await prisma.property.findUnique({
    where: {
      id: propertyId,
      ownerId: session.user.id,
    },
  });

  if (!property) {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded.' }, { status: 400 });
    }

    let rows: any[][];
    const fileBuffer = await file.arrayBuffer();

    if (file.type === 'text/csv') {
      const fileText = new TextDecoder().decode(fileBuffer);
      rows = Papa.parse(fileText, { skipEmptyLines: true }).data as any[][];
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.type === 'application/vnd.ms-excel'
    ) {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Please upload a CSV or Excel file.' }, { status: 400 });
    }
    
    const parsedData = await findHeadersAndParse(rows);

    const filteredData = parsedData.filter(row => {
      if (!row.unitNumber) {
        return false;
      }
      const unitNumberString = String(row.unitNumber).toLowerCase().trim();
      if (unitNumberString.length === 0) {
        return false;
      }
      // Filter out rows that are likely totals, notes, or otherwise invalid
      if (unitNumberString.startsWith('*') || unitNumberString.includes('total')) {
        return false;
      }
      return true;
    });

    const parsedUnits = filteredData.map((row: any) => {
      const unitNumber = row.unitNumber;
      const squareFootage = row.squareFootage;
      
      return {
        unitNumber: String(unitNumber),
        squareFootage: squareFootage ? parseInt(String(squareFootage).replace(/,/g, ''), 10) : null,
      };
    }).filter(unit => unit.unitNumber);

    if (parsedUnits.length === 0) {
      return NextResponse.json({ error: 'No valid unit data found in the file.' }, { status: 400 });
    }

    // Get a set of unique square footage values that are not null
    const uniqueSquareFootages = Array.from(new Set(
      parsedUnits
        .map(u => u.squareFootage)
        .filter((sf): sf is number => sf !== null && sf > 0)
    )).sort((a, b) => a - b);

    return NextResponse.json({ 
      parsedUnits,
      uniqueSquareFootages,
      expectedUnitsCount: property.numberOfUnits,
    }, { status: 200 });

  } catch (error: unknown) {
    console.error('Unit upload parsing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('Could not find a header row')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'An unexpected error occurred during unit upload.' },
      { status: 500 }
    );
  }
} 