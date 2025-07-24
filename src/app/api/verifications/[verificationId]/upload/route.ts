import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { writeFile } from 'fs/promises';
import path from 'path';
import { analyzeIncomeDocument } from '@/services/azureAi';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { analyzePaystubs } from '@/services/income';

async function saveFileLocally(fileBuffer: Buffer, fileName: string): Promise<string> {
  const uniqueFileName = `${Date.now()}-${fileName}`;
  const savePath = path.join(process.cwd(), 'uploads', uniqueFileName);
  await writeFile(savePath, fileBuffer);
  return savePath;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { verificationId: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { verificationId } = params;
  if (!verificationId) {
    return NextResponse.json({ error: 'Verification ID is required' }, { status: 400 });
  }

  try {
    const verification = await prisma.incomeVerification.findFirst({
      where: {
        id: verificationId,
        lease: { unit: { property: { ownerId: session.user.id } } },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found or access denied' }, { status: 404 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as DocumentType;
    const residentId = formData.get('residentId') as string;

    if (!file || !documentType || !residentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const filePath = await saveFileLocally(fileBuffer, file.name);

    let document = await prisma.incomeDocument.create({
      data: {
        documentType: documentType,
        documentDate: new Date(),
        uploadDate: new Date(),
        status: 'PROCESSING',
        filePath: filePath,
        verificationId: verificationId,
        residentId: residentId,
      },
    });

    try {
      const modelId = documentType === DocumentType.W2 ? "prebuilt-tax.us.w2" : "prebuilt-income";
      const analysisResult = await analyzeIncomeDocument(fileBuffer, modelId);
      console.log("Azure analysis result:", JSON.stringify(analysisResult, null, 2));

      const doc = analysisResult.documents?.[0];
      if (doc) {
        const fields = doc.fields;
        
        if (documentType === DocumentType.W2) {
            const wages = fields.WagesTipsAndOtherCompensation;
            const wageAmount = wages && wages.kind === 'number' ? wages.value : 0;
            
            const taxYearField = fields.TaxYear;
            const taxYearValue = (taxYearField?.kind === 'string' && taxYearField.value) ? parseInt(taxYearField.value, 10) : 0;

            const employee = fields.Employee;
            const employeeName = employee && employee.kind === 'object' ? (employee.properties?.Name)?.content : '';

            const employer = fields.Employer;
            const employerName = employer && employer.kind === 'object' ? (employer.properties?.Name)?.content : '';

            const socialSecurityWagesField = fields.SocialSecurityWages;
            const socialSecurityWages = socialSecurityWagesField && socialSecurityWagesField.kind === 'number' ? socialSecurityWagesField.value : null;

            const medicareWagesField = fields.MedicareWagesAndTips;
            const medicareWages = medicareWagesField && medicareWagesField.kind === 'number' ? medicareWagesField.value : null;
            
            if (wageAmount && taxYearValue && employeeName && employerName) {
                document = await prisma.incomeDocument.update({
                  where: { id: document.id },
                  data: {
                    status: DocumentStatus.COMPLETED,
                    box1_wages: wageAmount,
                    box3_ss_wages: socialSecurityWages,
                    box5_med_wages: medicareWages,
                    taxYear: taxYearValue,
                    employeeName: employeeName,
                    employerName: employerName,
                    calculatedAnnualizedIncome: wageAmount,
                  },
                });
              } else {
                console.log("W2 fields not found or empty in Azure response. Document requires manual review.");
                document = await prisma.incomeDocument.update({
                  where: { id: document.id },
                  data: { status: DocumentStatus.NEEDS_REVIEW },
                });
              }
        } else if (documentType === DocumentType.PAYSTUB) {
            const payPeriodStartDateField = fields.PayPeriodStartDate;
            const payPeriodStartDate = payPeriodStartDateField?.kind === 'date' ? payPeriodStartDateField.value : null;
            
            const payPeriodEndDateField = fields.PayPeriodEndDate;
            const payPeriodEndDate = payPeriodEndDateField?.kind === 'date' ? payPeriodEndDateField.value : null;

            const grossPayField = fields.GrossPay;
            const grossPayAmount = grossPayField?.kind === 'number' ? grossPayField.value : null;

            if(payPeriodStartDate && payPeriodEndDate && grossPayAmount) {
                document = await prisma.incomeDocument.update({
                    where: { id: document.id },
                    data: {
                        status: DocumentStatus.COMPLETED,
                        payPeriodStartDate,
                        payPeriodEndDate,
                        grossPayAmount
                    },
                  });
            } else {
                console.log("Paystub fields not found or empty in Azure response. Document requires manual review.");
                document = await prisma.incomeDocument.update({
                  where: { id: document.id },
                  data: { status: DocumentStatus.NEEDS_REVIEW },
                });
            }
        }

      } else {
        console.log("No document found in Azure response. Document requires manual review.");
        document = await prisma.incomeDocument.update({
          where: { id: document.id },
          data: { status: DocumentStatus.NEEDS_REVIEW },
        });
      }
    } catch (error) {
      console.error('Error analyzing document with Azure:', error);
      document = await prisma.incomeDocument.update({
        where: { id: document.id },
        data: { status: DocumentStatus.NEEDS_REVIEW },
      });
    }

    if (document.documentType === DocumentType.PAYSTUB && document.status === DocumentStatus.COMPLETED) {
        const residentPaystubs = await prisma.incomeDocument.findMany({
            where: {
                residentId: residentId,
                verificationId: verificationId,
                documentType: DocumentType.PAYSTUB,
                status: DocumentStatus.COMPLETED,
            }
        });
        
        const analysisResult = analyzePaystubs(residentPaystubs);
        
        if (analysisResult.annualizedIncome) {
            await prisma.incomeDocument.updateMany({
                where: {
                    id: { in: residentPaystubs.map(p => p.id) }
                },
                data: {
                    calculatedAnnualizedIncome: analysisResult.annualizedIncome,
                    payFrequency: analysisResult.payFrequency,
                }
            });
        }
    }

    const updatedDocument = await prisma.incomeDocument.findUnique({ where: { id: document.id }});

    return NextResponse.json(updatedDocument, { status: 201 });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}