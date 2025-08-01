import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { analyzeIncomeDocument } from '@/services/azureAi';
import { validatePaystubExtraction, validateW2Extraction, type PaystubValidationResult, type W2ValidationResult } from '@/services/azureValidation';
import { analyzePaystubs } from '@/services/income';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { DocumentType, DocumentStatus } from '@prisma/client';



export async function POST(request: NextRequest, { params }: { params: Promise<{ verificationId: string }> }) {
  
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { verificationId } = await params;
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as DocumentType;
    const residentId = formData.get('residentId') as string;

    if (!file || !documentType || !residentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify that the user owns this property through the verification
    const verification = await prisma.incomeVerification.findUnique({
      where: { id: verificationId },
      include: {
        lease: {
          include: {
            unit: {
              include: {
                property: true
              }
            }
          }
        }
      }
    });

    if (!verification || verification.lease?.unit?.property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'uploads');
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    // Save file to disk
    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${Date.now()}-${file.name}`;
    const filepath = join(uploadsDir, filename);
    await writeFile(filepath, buffer);

    console.log(`File uploaded: ${filename} for verification ${verificationId}, resident ${residentId}`);

         // Create initial document record
     let document = await prisma.incomeDocument.create({
       data: {
         documentType,
         documentDate: new Date(), // Required field for document date
         uploadDate: new Date(),
         status: DocumentStatus.PROCESSING,
         filePath: filename,
         verificationId,
         residentId,
       },
     });

    // Analyze the document with Azure Document Intelligence
    let analyzeResult;
    try {
      const modelId = documentType === DocumentType.W2 ? 'prebuilt-tax.us.w2' : 'prebuilt-payStub.us';
      analyzeResult = await analyzeIncomeDocument(buffer, modelId);
      console.log(`Azure analysis completed for document ${document.id}`);
    } catch (azureError) {
      console.error('Azure Document Intelligence failed:', azureError);
      
      // Mark document as needing admin review due to Azure failure
      document = await prisma.incomeDocument.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.NEEDS_REVIEW,
        }
      });

      // Create override request for Azure failure
      try {
        await prisma.overrideRequest.create({
          data: {
            type: 'DOCUMENT_REVIEW',
            status: 'PENDING',
            userExplanation: `Azure Document Intelligence failed to process ${documentType} document. Error: ${azureError instanceof Error ? azureError.message : 'Unknown error'}`,
            documentId: document.id,
            verificationId: verificationId,
            residentId: residentId,
            requesterId: session.user.id,
            propertyId: verification.lease?.unit?.property?.id,
          }
        });
      } catch (overrideError) {
        console.error('Failed to create auto-override request for Azure failure:', overrideError);
      }

      return NextResponse.json(document, { status: 201 });
    }

    // Debug: Log Azure response structure to understand the issue
    console.log(`[DEBUG] Azure response structure for document ${document.id}:`, {
      hasResult: !!analyzeResult,
      hasDocuments: !!analyzeResult?.documents,
      documentsLength: analyzeResult?.documents?.length || 0,
      hasFirstDocument: !!analyzeResult?.documents?.[0],
      hasFields: !!analyzeResult?.documents?.[0]?.fields,
      fieldsKeys: analyzeResult?.documents?.[0]?.fields ? Object.keys(analyzeResult.documents[0].fields) : [],
      sampleFieldNames: analyzeResult?.documents?.[0]?.fields ? Object.keys(analyzeResult.documents[0].fields).slice(0, 5) : []
    });

    // Validate Azure extraction results
    let validationResult: PaystubValidationResult | W2ValidationResult;
    
    if (documentType === DocumentType.PAYSTUB) {
      validationResult = validatePaystubExtraction(analyzeResult);
    } else if (documentType === DocumentType.W2) {
      validationResult = validateW2Extraction(analyzeResult);
    } else {
      return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 });
    }

    console.log(`Validation result for document ${document.id}:`, {
      isValid: validationResult.isValid,
      needsAdminReview: validationResult.needsAdminReview,
      confidence: validationResult.confidence,
      warningsCount: validationResult.warnings.length,
      errorsCount: validationResult.errors.length
    });

    // Handle validation results
    if (!validationResult.isValid || validationResult.needsAdminReview) {
      // Mark document as needing admin review
      document = await prisma.incomeDocument.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.NEEDS_REVIEW,
        }
      });

      // Create comprehensive explanation for admin
      const explanationParts = [];
      if (validationResult.errors.length > 0) {
        explanationParts.push(`Errors: ${validationResult.errors.join('; ')}`);
      }
      if (validationResult.warnings.length > 0) {
        explanationParts.push(`Warnings: ${validationResult.warnings.join('; ')}`);
      }
      explanationParts.push(`Confidence: ${(validationResult.confidence * 100).toFixed(1)}%`);
      
      const explanation = `Azure Document Intelligence extraction requires admin review. ${explanationParts.join(' | ')}`;

      // Create override request for admin review
      try {
        await prisma.overrideRequest.create({
          data: {
            type: 'DOCUMENT_REVIEW',
            status: 'PENDING',
            userExplanation: explanation,
            documentId: document.id,
            verificationId: verificationId,
            residentId: residentId,
            requesterId: session.user.id,
            propertyId: verification.lease?.unit?.property?.id,
          }
        });

        console.log(`Created admin review request for document ${document.id} due to validation issues`);
      } catch (overrideError) {
        console.error('Failed to create auto-override request for validation issues:', overrideError);
      }

      return NextResponse.json(document, { status: 201 });
    }

    // Validation passed - process the document using validated data
    if (documentType === DocumentType.W2) {
      const w2Result = validationResult as W2ValidationResult;
      const extractedData = w2Result.extractedData;
      
      // Use the highest amount from boxes 1, 3, 5 as per business rules
      const amounts = [extractedData.box1_wages, extractedData.box3_ss_wages, extractedData.box5_med_wages]
        .filter((amount): amount is number => amount !== null);
      
      if (amounts.length > 0) {
        const highestAmount = Math.max(...amounts);
        
        document = await prisma.incomeDocument.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.COMPLETED,
            box1_wages: extractedData.box1_wages,
            box3_ss_wages: extractedData.box3_ss_wages,
            box5_med_wages: extractedData.box5_med_wages,
            employeeName: extractedData.employeeName,
            employerName: extractedData.employerName,
            calculatedAnnualizedIncome: highestAmount
          }
        });

        // Update resident-level calculated income
        await prisma.$executeRaw`
          UPDATE "Resident" 
          SET "calculatedAnnualizedIncome" = ${Number(highestAmount)}::numeric
          WHERE "id" = ${document.residentId}
        `;
        
        console.log(`Updated resident ${document.residentId} with calculated annualized income: $${highestAmount}`);
      }
      
    } else if (documentType === DocumentType.PAYSTUB) {
      const paystubResult = validationResult as PaystubValidationResult;
      const extractedData = paystubResult.extractedData;
      
      if (extractedData.grossPayAmount && extractedData.payPeriodStartDate && extractedData.payPeriodEndDate) {
        // Determine pay frequency from pay period dates
        const payFrequency = determinePayFrequency(extractedData.payPeriodStartDate, extractedData.payPeriodEndDate);
        
        document = await prisma.incomeDocument.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.COMPLETED,
            payPeriodStartDate: extractedData.payPeriodStartDate,
            payPeriodEndDate: extractedData.payPeriodEndDate,
            grossPayAmount: extractedData.grossPayAmount,
            employeeName: extractedData.employeeName,
            employerName: extractedData.employerName,
            payFrequency: payFrequency,
          } as any,
        });

        // After successfully processing a paystub, analyze all paystubs for this resident
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
            // Update each paystub individually
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

            // Update resident-level calculated income
            await prisma.$executeRaw`
              UPDATE "Resident" 
              SET "calculatedAnnualizedIncome" = ${Number(analysisResult.annualizedIncome)}::numeric
              WHERE "id" = ${document.residentId}
            `;
            
            console.log(`Updated resident ${document.residentId} with calculated annualized income: $${analysisResult.annualizedIncome}`);
          }
        }
      }
    }

    return NextResponse.json(document, { status: 201 });

  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to determine pay frequency based on pay period dates
function determinePayFrequency(startDate: Date, endDate: Date): string {
  const daysDiff = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysDiff <= 7) return 'WEEKLY';
  if (daysDiff <= 14) return 'BI-WEEKLY';
  if (daysDiff <= 16) return 'SEMI-MONTHLY';
  if (daysDiff <= 31) return 'MONTHLY';
  
  return 'BI-WEEKLY'; // Default fallback
}