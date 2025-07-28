import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../auth/[...nextauth]/route';
import { analyzeIncomeDocument } from '../../../../../services/azureAi';
import { analyzePaystubs } from '../../../../../services/income';
import { createAutoOverrideRequest } from '../../../../../services/override';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../../../../lib/prisma';
import { DocumentType, DocumentStatus } from '@prisma/client';

// Helper function to determine pay frequency from pay period dates
function determinePayFrequency(startDate: Date, endDate: Date): string {
  const daysDiff = Math.abs(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysDiff >= 12 && daysDiff <= 16) {
    return 'BI_WEEKLY'; // Every 2 weeks
  } else if (daysDiff >= 6 && daysDiff <= 8) {
    return 'WEEKLY'; // Every week
  } else if (daysDiff >= 14 && daysDiff <= 17) {
    return 'SEMI_MONTHLY'; // Twice per month
  } else if (daysDiff >= 28 && daysDiff <= 32) {
    return 'MONTHLY'; // Once per month
  } else {
    return 'UNKNOWN';
  }
}

async function saveFileLocally(fileBuffer: Buffer, fileName: string): Promise<string> {
  const uniqueFileName = `${Date.now()}-${fileName}`;
  const savePath = path.join(process.cwd(), 'uploads', uniqueFileName);
  await fs.writeFile(savePath, fileBuffer);
  return savePath;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ verificationId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { verificationId } = await params;
    if (!verificationId) {
      return NextResponse.json({ error: 'Verification ID is required' }, { status: 400 });
    }

    // Verify the verification belongs to the user's property
    const verification = await prisma.incomeVerification.findUnique({
      where: {
        id: verificationId,
        lease: { unit: { property: { ownerId: session.user.id } } },
      },
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentTypeRaw = formData.get('documentType') as string;
    const residentId = formData.get('residentId') as string;

    if (!file || !documentTypeRaw || !residentId) {
      return NextResponse.json({ error: 'File, document type, and resident ID are required' }, { status: 400 });
    }

    console.log(`Processing upload for document type: ${documentTypeRaw}, resident: ${residentId}`);

    // Map form values to enum values
    const documentTypeMap: Record<string, DocumentType> = {
      'PAYSTUB': DocumentType.PAYSTUB,
      'W2': DocumentType.W2,
      'W-2': DocumentType.W2,
      'BANK_STATEMENT': DocumentType.BANK_STATEMENT,
      'OFFER_LETTER': DocumentType.OFFER_LETTER,
      'SOCIAL_SECURITY': DocumentType.SOCIAL_SECURITY,
    };

    const documentType = documentTypeMap[documentTypeRaw];
    if (!documentType) {
      return NextResponse.json({ error: `Invalid document type: ${documentTypeRaw}` }, { status: 400 });
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
      const modelId = documentType === DocumentType.W2 ? "prebuilt-tax.us.w2" : "prebuilt-payStub.us";
      const analysisResult = await analyzeIncomeDocument(fileBuffer, modelId);
      console.log("Azure analysis result:", JSON.stringify(analysisResult, null, 2));

      // The v4.0 API has a different response structure
      const analyzeResult = analysisResult.analyzeResult;
      if (analyzeResult && analyzeResult.documents && analyzeResult.documents.length > 0) {
        const doc = analyzeResult.documents[0];
        const fields = doc.fields;
        
        if (documentType === DocumentType.W2) {
            // Handle W2 documents with v4.0 API response structure
            const wages = fields?.WagesTipsAndOtherCompensation;
            const wageAmount = wages?.valueNumber || wages?.content ? parseFloat(wages.content) : 0;
            
            const taxYearField = fields?.TaxYear;
            const taxYearValue = taxYearField?.valueString ? parseInt(taxYearField.valueString, 10) : 
                                taxYearField?.content ? parseInt(taxYearField.content, 10) : 0;

            const employee = fields?.Employee;
            const employeeName = employee?.valueString || employee?.content || '';

            const employer = fields?.Employer;
            const employerName = employer?.valueString || employer?.content || '';

            const socialSecurityWagesField = fields?.SocialSecurityWages;
            const socialSecurityWages = socialSecurityWagesField?.valueNumber || 
                                      (socialSecurityWagesField?.content ? parseFloat(socialSecurityWagesField.content) : null);

            const medicareWagesField = fields?.MedicareWagesAndTips;
            const medicareWages = medicareWagesField?.valueNumber || 
                                (medicareWagesField?.content ? parseFloat(medicareWagesField.content) : null);
            
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

                // Automatically create override request for manual review
                try {
                  await createAutoOverrideRequest({
                    type: 'DOCUMENT_REVIEW',
                    documentId: document.id,
                    verificationId: verificationId,
                    residentId: residentId,
                    userId: session.user.id,
                    systemExplanation: `System was unable to automatically extract required fields from W2 document. Manual review required for income verification.`
                  });
                } catch (overrideError) {
                  console.error('Failed to create auto-override request for W2 document review:', overrideError);
                }
              }
        } else if (documentType === DocumentType.PAYSTUB) {
            // Handle paystubs with the new prebuilt-payStub.us model
            const payPeriodStartDate = fields?.PayPeriodStartDate?.valueDate ? new Date(fields.PayPeriodStartDate.valueDate) : null;
            const payPeriodEndDate = fields?.PayPeriodEndDate?.valueDate ? new Date(fields.PayPeriodEndDate.valueDate) : null;
            
            // Azure returns CurrentPeriodGrossPay for current pay period gross pay
            let grossPayAmount = null;
            
            // Debug logging to understand field structure
            console.log("CurrentPeriodGrossPay field debug:", {
                exists: !!fields?.CurrentPeriodGrossPay,
                field: fields?.CurrentPeriodGrossPay,
                valueNumber: fields?.CurrentPeriodGrossPay?.valueNumber,
                content: fields?.CurrentPeriodGrossPay?.content
            });
            
            // Try CurrentPeriodGrossPay first (most common)
            if (fields?.CurrentPeriodGrossPay?.valueNumber !== undefined) {
                grossPayAmount = fields.CurrentPeriodGrossPay.valueNumber;
                console.log("Found grossPayAmount via valueNumber:", grossPayAmount);
            } else if (fields?.CurrentPeriodGrossPay?.content) {
                const parsed = parseFloat(fields.CurrentPeriodGrossPay.content);
                if (!isNaN(parsed)) {
                    grossPayAmount = parsed;
                    console.log("Found grossPayAmount via content:", grossPayAmount);
                }
            }
            
            // Fallback to other field names if CurrentPeriodGrossPay not found
            if (grossPayAmount === null) {
                if (fields?.CurrentGrossPay?.valueNumber !== undefined) {
                    grossPayAmount = fields.CurrentGrossPay.valueNumber;
                } else if (fields?.CurrentGrossPay?.content) {
                    const parsed = parseFloat(fields.CurrentGrossPay.content);
                    if (!isNaN(parsed)) {
                        grossPayAmount = parsed;
                    }
                }
            }
            
            // If still no gross pay, try GrossPay
            if (grossPayAmount === null) {
                if (fields?.GrossPay?.valueNumber !== undefined) {
                    grossPayAmount = fields.GrossPay.valueNumber;
                } else if (fields?.GrossPay?.content) {
                    const parsed = parseFloat(fields.GrossPay.content);
                    if (!isNaN(parsed)) {
                        grossPayAmount = parsed;
                    }
                }
            }

            // Employee and Employer might be in different field structures
            const employeeName = fields?.Employee?.valueString || 
                               fields?.Employee?.content || 
                               fields?.EmployeeName?.valueString || 
                               fields?.EmployeeName?.content || '';
                               
            const employerName = fields?.Employer?.valueString || 
                               fields?.Employer?.content || 
                               fields?.EmployerName?.valueString || 
                               fields?.EmployerName?.content || '';

            console.log("Paystub analysis result:", {
                payPeriodStartDate,
                payPeriodEndDate, 
                grossPayAmount,
                employeeName,
                employerName,
                availableFields: Object.keys(fields || {})
            });

            if(payPeriodStartDate && payPeriodEndDate && grossPayAmount && grossPayAmount > 0) {
                // Determine pay frequency from this single paystub
                const payFrequency = determinePayFrequency(payPeriodStartDate, payPeriodEndDate);
                
                document = await prisma.incomeDocument.update({
                    where: { id: document.id },
                    data: {
                        status: DocumentStatus.COMPLETED,
                        payPeriodStartDate: payPeriodStartDate,
                        payPeriodEndDate: payPeriodEndDate,
                        grossPayAmount: grossPayAmount,
                        employeeName: employeeName,
                        employerName: employerName,
                        payFrequency: payFrequency,
                    } as any,
                  });

                // After successfully processing a paystub, analyze all paystubs for this resident
                // to calculate annualized income and pay frequency
                const residentPaystubs = await prisma.incomeDocument.findMany({
                  where: {
                    residentId: document.residentId,
                    verificationId: document.verificationId,
                    documentType: DocumentType.PAYSTUB,
                    status: DocumentStatus.COMPLETED,
                  },
                  orderBy: {
                    uploadDate: 'desc'
                  }
                });

                if (residentPaystubs.length >= 1) {
                  const analysisResult = analyzePaystubs(residentPaystubs);
                  console.log("Paystub analysis result:", analysisResult);

                  if (analysisResult.annualizedIncome && analysisResult.payFrequency) {
                    // Update each paystub individually to avoid updateMany type issues
                    const updatePromises = residentPaystubs.map(stub => 
                        prisma.incomeDocument.update({
                            where: { id: stub.id },
                            data: {
                                calculatedAnnualizedIncome: analysisResult.annualizedIncome!,
                                payFrequency: analysisResult.payFrequency!,
                            } as any
                        })
                    );
                    await Promise.all(updatePromises);

                    // PHASE 2 ARCHITECTURE: Also update resident-level calculated income
                    await prisma.$executeRaw`
                      UPDATE "Resident" 
                      SET "calculatedAnnualizedIncome" = ${Number(analysisResult.annualizedIncome)}::numeric
                      WHERE "id" = ${document.residentId}
                    `;
                    
                    console.log(`Updated resident ${document.residentId} with calculated annualized income: $${analysisResult.annualizedIncome}`);
                  }
                }
            } else {
                console.log("Paystub fields not found or empty in Azure response. Document requires manual review.");
                console.log("Missing fields:", {
                    hasPayPeriodStartDate: !!payPeriodStartDate,
                    hasPayPeriodEndDate: !!payPeriodEndDate,
                    hasGrossPayAmount: !!grossPayAmount,
                    grossPayValue: grossPayAmount
                });
                document = await prisma.incomeDocument.update({
                  where: { id: document.id },
                  data: { status: DocumentStatus.NEEDS_REVIEW },
                });

                // Automatically create override request for manual review
                try {
                  await createAutoOverrideRequest({
                    type: 'DOCUMENT_REVIEW',
                    documentId: document.id,
                    verificationId: verificationId,
                    residentId: residentId,
                    userId: session.user.id,
                    systemExplanation: `System was unable to automatically extract required fields from paystub document. Manual review required for income verification. Missing fields: ${JSON.stringify({
                      hasPayPeriodStartDate: !!payPeriodStartDate,
                      hasPayPeriodEndDate: !!payPeriodEndDate,
                      hasGrossPayAmount: !!grossPayAmount
                    })}`
                  });
                } catch (overrideError) {
                  console.error('Failed to create auto-override request for paystub document review:', overrideError);
                }
            }
        }

      } else {
        console.log("No documents found in Azure response. Document requires manual review.");
        document = await prisma.incomeDocument.update({
          where: { id: document.id },
          data: { status: DocumentStatus.NEEDS_REVIEW },
        });

        // Automatically create override request for manual review
        try {
          await createAutoOverrideRequest({
            type: 'DOCUMENT_REVIEW',
            documentId: document.id,
            verificationId: verificationId,
            residentId: residentId,
            userId: session.user.id,
            systemExplanation: `No documents found in Azure response. Document analysis failed and requires manual review for income verification.`
          });
        } catch (overrideError) {
          console.error('Failed to create auto-override request for no documents found:', overrideError);
        }
      }
    } catch (error) {
      console.error('Error analyzing document with Azure:', error);
      document = await prisma.incomeDocument.update({
        where: { id: document.id },
        data: { status: DocumentStatus.NEEDS_REVIEW },
      });

      // Automatically create override request for manual review
      try {
        await createAutoOverrideRequest({
          type: 'DOCUMENT_REVIEW',
          documentId: document.id,
          verificationId: verificationId,
          residentId: residentId,
          userId: session.user.id,
          systemExplanation: `Azure document analysis error: ${error instanceof Error ? error.message : 'Unknown error'}. Manual review required for income verification.`
        });
      } catch (overrideError) {
        console.error('Failed to create auto-override request for Azure error:', overrideError);
      }
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
        
        if (analysisResult.annualizedIncome && analysisResult.payFrequency) {
            // Update each paystub individually to avoid updateMany type issues
            const updatePromises = residentPaystubs.map(stub => 
                prisma.incomeDocument.update({
                    where: { id: stub.id },
                    data: {
                        calculatedAnnualizedIncome: analysisResult.annualizedIncome!,
                        payFrequency: analysisResult.payFrequency!,
                    } as any
                })
            );
            await Promise.all(updatePromises);

            // PHASE 2 ARCHITECTURE: Also update resident-level calculated income
            await prisma.$executeRaw`
              UPDATE "Resident" 
              SET "calculatedAnnualizedIncome" = ${Number(analysisResult.annualizedIncome)}::numeric
              WHERE "id" = ${residentId}
            `;
            
            console.log(`Updated resident ${residentId} with calculated annualized income: $${analysisResult.annualizedIncome}`);
        }
    }

    const updatedDocument = await prisma.incomeDocument.findUnique({ where: { id: document.id }});

    return NextResponse.json(updatedDocument, { status: 201 });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}