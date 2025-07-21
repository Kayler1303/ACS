import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import { writeFile, readFile, mkdir } from "fs/promises";
import path from "path";
import { analyzeIncomeDocument } from "@/services/azureAi";

const modelMapping: { [key: string]: string } = {
  W2: 'prebuilt-tax.us.w2',
  PAYSTUB: 'prebuilt-payStub.us',
  BANK_STATEMENT: 'prebuilt-bankStatement',
  OFFER_LETTER: 'prebuilt-layout', // Using layout for keyword searching
  SOCIAL_SECURITY: 'prebuilt-tax.us.1099SSA',
};

// Helper function to parse currency and calculate annual income
const parseAndAnnualize = (field: any, annualizationFactor: number = 1): number | null => {
    if (field && typeof field.confidence === 'number' && field.confidence > 0.9 && field.value !== undefined) {
        if (field.kind === 'currency') {
            return field.value.amount * annualizationFactor;
        }
        if (field.kind === 'number') {
            return field.value * annualizationFactor;
        }
    }
    return null;
};

// --- NEW HELPER FUNCTIONS for Income Verification ---

// Finds an 'IN_PROGRESS' verification for a tenancy, or creates a new one.
async function findOrCreateInProgressVerification(tenancyId: string) {
  let verification = await prisma.incomeVerification.findFirst({
    where: {
      tenancyId,
      status: 'IN_PROGRESS',
    },
  });

  if (!verification) {
    // Get tenancy details for verification period calculation
    const tenancy = await prisma.tenancy.findUnique({
      where: { id: tenancyId },
    });
    
    if (!tenancy) {
      throw new Error('Tenancy not found');
    }
    
    // Calculate verification period based on lease
    const now = new Date();
    const leaseStart = new Date(tenancy.leaseStartDate);
    const dueDate = new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days from now
    
    verification = await prisma.incomeVerification.create({
      data: {
        tenancyId,
        status: 'IN_PROGRESS',
        reason: 'ANNUAL_RECERTIFICATION',
        verificationPeriodStart: tenancy.leaseStartDate,
        verificationPeriodEnd: tenancy.leaseEndDate,
        dueDate,
        leaseYear: 1,
        associatedLeaseStart: tenancy.leaseStartDate,
        associatedLeaseEnd: tenancy.leaseEndDate,
      },
    });
  }

  return verification;
}

// The core calculation engine for a verification period for the entire tenancy.
async function recalculateVerificationIncome(verificationId: string) {
  const verification = await prisma.incomeVerification.findUnique({
    where: { id: verificationId },
    include: {
      tenancy: {
        include: {
          residents: {
            include: {
              incomeDocuments: {
                where: {
                  verificationId: verificationId,
                  status: 'COMPLETED'
                }
              }
            }
          }
        }
      },
    },
  });

  if (!verification || !verification.tenancy) return;

  let totalTenancyVerifiedIncome = 0;

  for (const resident of verification.tenancy.residents) {
    let residentVerifiedIncome = 0;
    const documentsByEmployer: { [key: string]: any[] } = {};

    // Group documents by employer for the current resident
    for (const doc of resident.incomeDocuments) {
      const employer = doc.employerName || 'default';
      if (!documentsByEmployer[employer]) {
        documentsByEmployer[employer] = [];
      }
      documentsByEmployer[employer].push(doc);
    }

    // Calculate income for each employer group for the resident
    for (const employer in documentsByEmployer) {
      const docs = documentsByEmployer[employer];
      const w2 = docs.find((d: { documentType: string; }) => d.documentType === 'W2');

      if (w2) {
        residentVerifiedIncome += Math.max(
          (w2 as any).box1_wages || 0,
          (w2 as any).box3_ss_wages || 0,
          (w2 as any).box5_med_wages || 0
        );
      } else {
        const paystubs = docs.filter((d: { documentType: string; }) => d.documentType === 'PAYSTUB');
        if (paystubs.length > 0) {
          const totalGrossPay = paystubs.reduce((sum, stub: any) => sum + (stub.box1_wages || 0), 0); // Assuming grossPay is stored in box1_wages for paystubs
          const averageGrossPay = totalGrossPay / paystubs.length;
          residentVerifiedIncome += averageGrossPay * 26; // Placeholder: bi-weekly
        }
      }
    }
    
    // Add income from non-employer sources for the resident
    const otherDocs = resident.incomeDocuments.filter((d: { employerName: string | null; }) => !d.employerName);
    for (const doc of otherDocs) {
      if ((doc as any).documentType === 'SOCIAL_SECURITY' && (doc as any).box1_wages) { // Assuming net benefits stored in box1_wages
        residentVerifiedIncome += (doc as any).box1_wages * 12; // Assuming monthly
      }
    }

    // Update individual resident's verified income
    await prisma.resident.update({
      where: { id: resident.id },
      data: { verifiedIncome: residentVerifiedIncome }
    });

    totalTenancyVerifiedIncome += residentVerifiedIncome;
  }

  // Update the verification record with the new total for the whole tenancy
  await prisma.incomeVerification.update({
    where: { id: verificationId },
    data: {
      calculatedVerifiedIncome: totalTenancyVerifiedIncome,
    },
  });
}


// --- REWRITTEN POST FUNCTION ---

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: tenancyId } = await params;
  
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    
    const documentType = formData.get('documentType') as string;
    if (!documentType) return NextResponse.json({ error: 'Document type is required' }, { status: 400 });

    const residentId = formData.get('residentId') as string;
    if (!residentId) return NextResponse.json({ error: 'Resident ID is required' }, { status: 400 });

    // Step 1: Find or create the active verification period for the Tenancy
    const verification = await findOrCreateInProgressVerification(tenancyId);
    
    // Step 2: Save file and create initial document record
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${new Date().getTime()}-${file.name.replace(/\s/g, "_")}`;
    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, filename);
    await writeFile(filePath, buffer);

    const newDocument = await prisma.incomeDocument.create({
      data: {
        verificationId: verification.id,
        residentId: residentId, // Associate with the specific resident
        documentType,
        documentDate: new Date(), // Placeholder, will be updated after analysis
        filePath,
      },
    });

    // Step 3: Start background analysis
    (async () => {
      let updateData: { [key: string]: any } = {};
      try {
        await prisma.incomeDocument.update({ where: { id: newDocument.id }, data: { status: 'PROCESSING' } });

        const modelId = modelMapping[documentType];
        if (!modelId) throw new Error(`Unsupported document type: ${documentType}`);
        
        const fileBuffer = await readFile(filePath);
        const analysisResult = await analyzeIncomeDocument(fileBuffer, modelId);
        const document = analysisResult.documents?.[0];

        if (document && document.confidence > 0.9) {
          updateData.status = 'COMPLETED';
          // ... (extract all data like before: taxYear, names, box values, etc.)
          // This part remains largely the same
          if (document.docType === 'tax.us.w2') {
            const wages = parseAndAnnualize(document.fields['WagesTipsAndOtherCompensation']);
            const ssWages = parseAndAnnualize(document.fields['SocialSecurityWages']);
            const medWages = parseAndAnnualize(document.fields['MedicareWagesAndTips']);
            const employeeField = document.fields['Employee'];
            const employerField = document.fields['Employer'];
            const taxYearField = document.fields['TaxYear'];
            
            const employeeName = employeeField?.kind === 'object' && employeeField.properties?.Name?.kind === 'string' ? employeeField.properties.Name.value : undefined;
            const employerName = employerField?.kind === 'object' && employerField.properties?.Name?.kind === 'string' ? employerField.properties.Name.value : undefined;
            const taxYearString = taxYearField?.kind === 'string' ? taxYearField.value : undefined;
            const taxYear = taxYearString ? parseInt(taxYearString, 10) : undefined;
            
            if (taxYear) updateData.documentDate = new Date(taxYear, 11, 31);
            
            updateData = { ...updateData, employeeName, employerName, taxYear, box1_wages: wages, box3_ss_wages: ssWages, box5_med_wages: medWages };
          }
           // ... add extraction for other doc types here ...
        }

        if (!updateData.status) updateData.status = 'NEEDS_REVIEW';
        
        await prisma.incomeDocument.update({ where: { id: newDocument.id }, data: updateData });

        // Step 4: After updating the document, trigger the recalculation for the whole verification
        if (updateData.status === 'COMPLETED') {
          await recalculateVerificationIncome(verification.id);
        }

      } catch (err: any) {
        console.error(`Analysis failed for document ${newDocument.id}:`, err);
        await prisma.incomeDocument.update({ where: { id: newDocument.id }, data: { status: 'NEEDS_REVIEW' } });
      }
    })();

    return NextResponse.json({ message: "Document uploaded and is being processed." }, { status: 200 });

  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
} 