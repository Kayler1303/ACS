import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { analyzeIncomeDocument } from '@/services/azureAi';
import { AnalyzedDocument, DocumentField } from '@azure/ai-form-recognizer';

// --- Helper function to safely get field values ---
const getFieldValue = (
  document: AnalyzedDocument,
  fieldName: string
): string | number | undefined => {
  const field = document.fields?.[fieldName] as DocumentField | undefined;
  if (!field) return undefined;

  switch (field.kind) {
    case 'string':
      return field.value;
    case 'number':
      return field.value;
    // Add other types as needed
    default:
      return field.content;
  }
};

// --- Helper function for name matching (simple version) ---
// A more robust solution might use a fuzzy matching library
const isNameMatch = (docName: string, residentName: string): boolean => {
  const docNameParts = docName.toLowerCase().split(' ');
  const residentNameParts = residentName.toLowerCase().split(' ');
  return residentNameParts.every(part => docNameParts.includes(part));
};

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const residentId = params.id;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Security Check: Verify user owns the resident ---
  const resident = await prisma.resident.findFirst({
    where: {
      id: residentId,
      unit: {
        property: {
          ownerId: session.user.id,
        },
      },
    },
  });

  if (!resident) {
    return NextResponse.json({ error: 'Resident not found or access denied' }, { status: 404 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 });
    }

    let totalIncome = 0;
    
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const analysisResult = await analyzeIncomeDocument(buffer);

      for (const document of analysisResult.documents || []) {
        // --- Name Matching ---
        const employeeName = getFieldValue(document, 'EmployeeName') as string;
        if (!employeeName || !isNameMatch(employeeName, resident.name)) {
          // You might want to return a more specific error here
          console.warn(`Document name "${employeeName}" does not match resident "${resident.name}". Skipping document.`);
          continue;
        }

        // --- Income Calculation ---
        // This is a simplified example. A real-world scenario would need to
        // handle different pay periods, multiple W-2s, etc.
        if (document.docType === 'income:w2:2022' || document.docType === 'income:w2:2023') {
           const wages = getFieldValue(document, 'WagesTipsAndOtherCompensation') as number;
           if (wages) totalIncome += wages;
        } else if (document.docType === 'income:paystub:2022' || document.docType === 'income:paystub:2023') {
          const currentGrossPay = getFieldValue(document, 'CurrentGrossPay') as number;
          // This is a huge assumption - you'd need pay frequency (weekly, bi-weekly)
          // to properly annualize. For now, we'll assume monthly for demo purposes.
          if(currentGrossPay) totalIncome += currentGrossPay * 12;
        }
      }
    }

    if (totalIncome === 0) {
       return NextResponse.json({ error: 'Could not determine income from the provided documents.' }, { status: 400 });
    }
    
    // --- Update Resident's Income ---
    const updatedResident = await prisma.resident.update({
      where: { id: residentId },
      data: { annualizedIncome: totalIncome },
    });

    return NextResponse.json({
      message: 'Income analyzed successfully.',
      annualizedIncome: updatedResident.annualizedIncome,
    });

  } catch (error) {
    console.error('Income analysis error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred during income analysis.' }, { status: 500 });
  }
} 