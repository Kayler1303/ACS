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
import { isWithinInterval, subMonths, getYear, addMonths } from 'date-fns';
import { randomUUID } from 'crypto';

// Helper function to check if document date is more than 5 months after lease start
function checkDateDiscrepancy(documentDate: Date, leaseStartDate: Date): { hasDiscrepancy: boolean, monthsDifference: number } {
  const fiveMonthsAfterLease = addMonths(leaseStartDate, 5);
  const hasDiscrepancy = documentDate > fiveMonthsAfterLease;
  
  // Calculate difference in months for logging
  const yearDiff = documentDate.getFullYear() - leaseStartDate.getFullYear();
  const monthDiff = documentDate.getMonth() - leaseStartDate.getMonth();
  const monthsDifference = yearDiff * 12 + monthDiff;
  
  return { hasDiscrepancy, monthsDifference };
}

// Helper functions for document validation
function validateDocumentTimeliness(doc: any, leaseStartDate: Date): { isValid: boolean, reason?: string } {
  if (!doc.documentType) {
    return { isValid: false, reason: 'Document type missing' };
  }

  if (doc.documentType === DocumentType.W2) {
    if (!doc.taxYear) {
      return { isValid: false, reason: 'W2 missing tax year' };
    }
    const leaseStartYear = getYear(leaseStartDate);
    const leaseStartMonth = leaseStartDate.getMonth(); // 0-indexed (0=Jan, 1=Feb, 2=Mar)

    const isTimely = leaseStartMonth <= 2 
      ? (doc.taxYear === leaseStartYear - 1 || doc.taxYear === leaseStartYear - 2)
      : (doc.taxYear === leaseStartYear - 1);
    
    if (!isTimely) {
      return { 
        isValid: false, 
        reason: `W2 tax year ${doc.taxYear} is not timely for lease starting ${leaseStartDate.toDateString()}`
      };
    }
  } else {
    // For non-W2 documents: must be within 6 months prior to lease start OR on/after lease start
    const documentDate = new Date(doc.documentDate || doc.payPeriodEndDate);
    const sixMonthsBeforeLeaseStart = subMonths(leaseStartDate, 6);
    const tenYearsAfterLeaseStart = new Date(new Date(leaseStartDate).setFullYear(leaseStartDate.getFullYear() + 10));
    
    const isTimely = isWithinInterval(documentDate, { start: sixMonthsBeforeLeaseStart, end: tenYearsAfterLeaseStart });
    
    if (!isTimely) {
      return { 
        isValid: false, 
        reason: `Document date ${documentDate.toDateString()} is not within acceptable range for lease starting ${leaseStartDate.toDateString()}`
      };
    }
  }

  return { isValid: true };
}

function validateDocumentName(doc: any, residentName: string): { isValid: boolean, reason?: string } {
  if (!doc.employeeName || !residentName) {
    return { isValid: false, reason: 'Missing employee name or resident name' };
  }

  const residentNameLower = residentName.toLowerCase();
  const employeeNameLower = doc.employeeName.toLowerCase();

  // Check for reasonable name match (same logic as in verification service)
  const residentParts = residentNameLower.split(/[\s,]+/).filter(part => part.length > 1);
  const employeeParts = employeeNameLower.split(/[\s,]+/).filter(part => part.length > 1);

  let namesMatch = false;

  // Check if both first and last names appear in both
  if (residentParts.length >= 2 && employeeParts.length >= 2) {
    const sharedParts = residentParts.filter(part => employeeParts.includes(part));
    if (sharedParts.length >= 2) {
      namesMatch = true;
    }
  }

  // Fallback to original contains logic
  if (!namesMatch) {
    namesMatch = residentNameLower.includes(employeeNameLower) || employeeNameLower.includes(residentNameLower);
  }

  if (!namesMatch) {
    return { 
      isValid: false, 
      reason: `Employee name "${doc.employeeName}" does not sufficiently match resident name "${residentName}"`
    };
  }

  return { isValid: true };
}

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
    const forceUpload = formData.get('forceUpload') === 'true'; // Allow bypassing date check

    if (!file || !documentType || !residentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify that the user owns this property through the verification
    const verification = await prisma.incomeVerification.findUnique({
      where: { id: verificationId },
      include: {
        Lease: {
          include: {
            Unit: {
              include: {
                Property: true
              }
            }
          }
        }
      }
    });

    if (!verification || verification.Lease?.Unit?.Property?.ownerId !== session.user.id) {
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
         id: randomUUID(),
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
            id: randomUUID(),
            type: 'DOCUMENT_REVIEW',
            status: 'PENDING',
            userExplanation: `Azure Document Intelligence failed to process ${documentType} document. Error: ${azureError instanceof Error ? azureError.message : 'Unknown error'}`,
            documentId: document.id,
            verificationId: verificationId,
            residentId: residentId,
            requesterId: session.user.id,
            propertyId: verification.Lease?.Unit?.Property?.id,
            updatedAt: new Date(),
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
            id: randomUUID(),
            type: 'DOCUMENT_REVIEW',
            status: 'PENDING',
            userExplanation: explanation,
            documentId: document.id,
            verificationId: verificationId,
            residentId: residentId,
            requesterId: session.user.id,
            propertyId: verification.Lease?.Unit?.Property?.id,
            updatedAt: new Date(),
          }
        });

        console.log(`Created admin review request for document ${document.id} due to validation issues`);
      } catch (overrideError) {
        console.error('Failed to create auto-override request for validation issues:', overrideError);
      }

      return NextResponse.json(document, { status: 201 });
    }

    // Validation passed - now check timeliness and name matching
    // Get lease information for validation
    const lease = await prisma.lease.findFirst({
      where: { 
        IncomeVerification: { 
          some: { id: verificationId } 
        } 
      },
      include: {
        Resident: true
      }
    });

    if (!lease) {
      return NextResponse.json(
        { error: 'Could not find lease for validation' }, 
        { status: 400 }
      );
    }

    // Skip timeliness validation for future leases without start dates
    if (!lease.leaseStartDate) {
      console.log(`⏭️ Skipping timeliness validation for future lease ${lease.name} (no start date set)`);
      
      // Save extracted data for future leases (similar to normal lease processing)
      if (documentType === DocumentType.W2) {
        const w2Result = validationResult as W2ValidationResult;
        const extractedData = w2Result.extractedData;
        
        // Use the highest amount from boxes 1, 3, 5 as per business rules
        const amounts = [extractedData.box1_wages, extractedData.box3_ss_wages, extractedData.box5_med_wages]
          .filter((amount): amount is number => amount !== null);
        
        let updateData: any = {
          status: DocumentStatus.COMPLETED,
          box1_wages: extractedData.box1_wages,
          box3_ss_wages: extractedData.box3_ss_wages,
          box5_med_wages: extractedData.box5_med_wages,
          employeeName: extractedData.employeeName,
          employerName: extractedData.employerName,
        };

        if (amounts.length > 0) {
          updateData.calculatedAnnualizedIncome = Math.max(...amounts);
        }

        document = await prisma.incomeDocument.update({
          where: { id: document.id },
          data: updateData
        });
        
      } else if (documentType === DocumentType.PAYSTUB) {
        const paystubResult = validationResult as PaystubValidationResult;
        const extractedData = paystubResult.extractedData;
        
        let updateData: any = {
          status: DocumentStatus.COMPLETED,
          employeeName: extractedData.employeeName,
          employerName: extractedData.employerName,
        };

        if (extractedData.grossPayAmount) {
          updateData.grossPayAmount = extractedData.grossPayAmount;
        }
        
        if (extractedData.payPeriodStartDate) {
          updateData.payPeriodStartDate = extractedData.payPeriodStartDate;
        }
        
        if (extractedData.payPeriodEndDate) {
          updateData.payPeriodEndDate = extractedData.payPeriodEndDate;
        }

        // Add pay frequency calculation for future leases too
        if (extractedData.payPeriodStartDate && extractedData.payPeriodEndDate) {
          const payFrequency = determinePayFrequency(extractedData.payPeriodStartDate, extractedData.payPeriodEndDate);
          updateData.payFrequency = payFrequency;
        }

        document = await prisma.incomeDocument.update({
          where: { id: document.id },
          data: updateData
        });
      }

      console.log(`✅ Future lease document processed with extracted data: ${document.id}`);
      return NextResponse.json(document, { status: 201 });
    }

    const resident = lease.Resident.find(r => r.id === residentId);
    if (!resident) {
      return NextResponse.json(
        { error: 'Resident not found in lease' }, 
        { status: 400 }
      );
    }

    // Create document data for validation
    const docForValidation = {
      documentType,
      documentDate: new Date(),
      employeeName: documentType === DocumentType.W2 
        ? (validationResult as W2ValidationResult).extractedData.employeeName
        : (validationResult as PaystubValidationResult).extractedData.employeeName,
      taxYear: documentType === DocumentType.W2 
        ? (validationResult as W2ValidationResult).extractedData.taxYear
        : null,
      payPeriodEndDate: documentType === DocumentType.PAYSTUB 
        ? (validationResult as PaystubValidationResult).extractedData.payPeriodEndDate
        : null
    };

    // Check for date discrepancy (only if not forced upload)
    if (!forceUpload) {
      // Extract the relevant document date
      let documentDate: Date | null = null;
      
      if (documentType === DocumentType.PAYSTUB && docForValidation.payPeriodEndDate) {
        documentDate = new Date(docForValidation.payPeriodEndDate);
      } else if (documentType === DocumentType.W2 && docForValidation.taxYear) {
        // For W2, use December 31st of the tax year
        documentDate = new Date(`December 31, ${docForValidation.taxYear}`);
      }
      
      if (documentDate && lease.leaseStartDate) {
        const dateCheck = checkDateDiscrepancy(documentDate, new Date(lease.leaseStartDate));
        
        if (dateCheck.hasDiscrepancy) {
          console.log(`Date discrepancy detected: Document date ${documentDate.toISOString()} is ${dateCheck.monthsDifference} months after lease start ${lease.leaseStartDate}`);
          
          // Return special response indicating date discrepancy
          return NextResponse.json({
            requiresDateConfirmation: true,
            leaseStartDate: lease.leaseStartDate,
            documentDate: documentDate.toISOString(),
            monthsDifference: dateCheck.monthsDifference,
            message: 'Document date is more than 5 months after lease start date. Please confirm.'
          }, { status: 200 });
        }
      }
    }

    // Validate timeliness and name matching
    const timelinessCheck = validateDocumentTimeliness(docForValidation, new Date(lease.leaseStartDate));
    const nameCheck = validateDocumentName(docForValidation, resident.name);

    if (!timelinessCheck.isValid || !nameCheck.isValid) {
      // Mark document as needing review due to validation issues
      document = await prisma.incomeDocument.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.NEEDS_REVIEW,
          // Still save the extracted data for admin review
          ...(documentType === DocumentType.W2 ? {
            box1_wages: (validationResult as W2ValidationResult).extractedData.box1_wages,
            box3_ss_wages: (validationResult as W2ValidationResult).extractedData.box3_ss_wages,
            box5_med_wages: (validationResult as W2ValidationResult).extractedData.box5_med_wages,
            employeeName: (validationResult as W2ValidationResult).extractedData.employeeName,
            employerName: (validationResult as W2ValidationResult).extractedData.employerName,
            taxYear: (validationResult as W2ValidationResult).extractedData.taxYear
          } : {
            payPeriodStartDate: (validationResult as PaystubValidationResult).extractedData.payPeriodStartDate,
            payPeriodEndDate: (validationResult as PaystubValidationResult).extractedData.payPeriodEndDate,
            grossPayAmount: (validationResult as PaystubValidationResult).extractedData.grossPayAmount,
            employeeName: (validationResult as PaystubValidationResult).extractedData.employeeName,
            employerName: (validationResult as PaystubValidationResult).extractedData.employerName,
            payFrequency: (validationResult as PaystubValidationResult).extractedData.payFrequency
          })
        }
      });

      // Create detailed explanation for admin review
      const issues = [];
      if (!timelinessCheck.isValid) issues.push(timelinessCheck.reason);
      if (!nameCheck.isValid) issues.push(nameCheck.reason);
      
      const explanation = `Document validation issues found: ${issues.join('; ')}. User can either delete and reupload correct documents or request admin override.`;

      // Create override request for admin review
      try {
        await prisma.overrideRequest.create({
          data: {
            id: randomUUID(),
            type: 'DOCUMENT_REVIEW',
            status: 'PENDING',
            userExplanation: explanation,
            documentId: document.id,
            verificationId: verificationId,
            residentId: residentId,
            requesterId: session.user.id,
            propertyId: verification.Lease?.Unit?.Property?.id,
            updatedAt: new Date(),
          }
        });

        console.log(`Created validation override request for document ${document.id}: ${explanation}`);
      } catch (overrideError) {
        console.error('Failed to create validation override request:', overrideError);
      }

      return NextResponse.json({
        ...document,
        validationIssues: issues,
        requiresAction: true,
        actionOptions: [
          'Delete and reupload correct documents',
          'Request admin override approval'
        ]
      }, { status: 201 });
    }

    // All validation passed - process the document using validated data
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
    
    // Critical: If we have a document ID, ensure it's not left in PROCESSING status
    if (document?.id) {
      try {
        console.log(`🚨 [RECOVERY] Document ${document.id} encountered error - updating status to prevent stuck state`);
        
        await prisma.incomeDocument.update({
          where: { id: document.id },
          data: { 
            status: DocumentStatus.NEEDS_REVIEW  // Mark for admin review rather than leaving stuck
          }
        });
        
        console.log(`✅ [RECOVERY] Document ${document.id} marked as NEEDS_REVIEW to prevent stuck state`);
      } catch (recoveryError) {
        console.error(`❌ [RECOVERY] Failed to update stuck document ${document.id}:`, recoveryError);
      }
    }
    
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