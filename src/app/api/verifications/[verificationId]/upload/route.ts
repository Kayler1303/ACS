import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { analyzeIncomeDocument } from '@/services/azureAi';
import { validatePaystubExtraction, validateW2Extraction, type PaystubValidationResult, type W2ValidationResult } from '@/services/azureValidation';
import { analyzePaystubs } from '@/services/income';
// File system imports removed - Vercel serverless doesn't support file writes
import { DocumentType, DocumentStatus } from '@prisma/client';
import { isWithinInterval, subMonths, getYear, addMonths } from 'date-fns';
import { randomUUID } from 'crypto';
import { uploadToBlob, generateBlobFileName, isBlobStorageConfigured } from '@/lib/blob-storage';

// Configure route for larger file uploads
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout

// Helper function to detect duplicate documents
async function checkForDuplicateDocument(
  residentId: string, 
  documentType: DocumentType, 
  extractedData: any
): Promise<{ isDuplicate: boolean, duplicateId?: string, reason?: string }> {
  try {
    console.log(`🔍 [DUPLICATE CHECK] Searching for existing documents for resident: ${residentId}, type: ${documentType}`);
    
    // Get existing documents for this resident of the same type that are not failed/deleted
    const existingDocuments = await prisma.incomeDocument.findMany({
      where: {
        residentId,
        documentType,
        status: {
          in: [DocumentStatus.COMPLETED, DocumentStatus.NEEDS_REVIEW]
        }
      },
      orderBy: {
        uploadDate: 'desc'
      }
    });

    console.log(`🔍 [DUPLICATE CHECK] Found ${existingDocuments.length} existing documents:`, 
      existingDocuments.map(doc => ({
        id: doc.id,
        status: doc.status,
        taxYear: doc.taxYear,
        box1_wages: doc.box1_wages,
        employerName: doc.employerName,
        uploadDate: doc.uploadDate
      }))
    );

    if (existingDocuments.length === 0) {
      console.log(`🔍 [DUPLICATE CHECK] No existing documents found, allowing upload`);
      return { isDuplicate: false };
    }

    // Check for duplicates based on document type
    for (const existingDoc of existingDocuments) {
      let isDuplicateMatch = false;
      let reason = '';

      if (documentType === DocumentType.PAYSTUB) {
        // For paystubs, check: pay period dates, employer, and gross pay amount
        const existingPayPeriodStart = existingDoc.payPeriodStartDate;
        const existingPayPeriodEnd = existingDoc.payPeriodEndDate;
        const existingGrossPay = existingDoc.grossPayAmount;
        const existingEmployer = existingDoc.employerName;

        const newPayPeriodStart = extractedData.payPeriodStartDate;
        const newPayPeriodEnd = extractedData.payPeriodEndDate;
        const newGrossPay = extractedData.grossPayAmount;
        const newEmployer = extractedData.employerName;

        // Check if pay periods and key details match
        if (existingPayPeriodStart && existingPayPeriodEnd && newPayPeriodStart && newPayPeriodEnd) {
          const samePayPeriod = existingPayPeriodStart.getTime() === newPayPeriodStart.getTime() && 
                               existingPayPeriodEnd.getTime() === newPayPeriodEnd.getTime();
          const sameGrossPay = existingGrossPay && newGrossPay && 
                              Math.abs(Number(existingGrossPay) - Number(newGrossPay)) < 0.01;
          const sameEmployer = existingEmployer && newEmployer && 
                              existingEmployer.toLowerCase().trim() === newEmployer.toLowerCase().trim();

          if (samePayPeriod && sameGrossPay && sameEmployer) {
            isDuplicateMatch = true;
            reason = `Duplicate paystub detected: same pay period (${newPayPeriodStart.toLocaleDateString()} - ${newPayPeriodEnd.toLocaleDateString()}), employer (${newEmployer}), and gross pay ($${newGrossPay}). If you believe this is not a duplicate, please request an admin override.`;
          }
        }
      } else if (documentType === DocumentType.W2) {
        // For W2s, check: tax year, employer, and wage amounts
        const existingTaxYear = existingDoc.taxYear;
        const existingBox1Wages = existingDoc.box1_wages;
        const existingEmployer = existingDoc.employerName;

        const newTaxYear = extractedData.taxYear;
        const newBox1Wages = extractedData.box1_wages;
        const newEmployer = extractedData.employerName;

        if (existingTaxYear && newTaxYear && String(existingTaxYear) === String(newTaxYear)) {
          const sameBox1Wages = existingBox1Wages && newBox1Wages && 
                               Math.abs(Number(existingBox1Wages) - Number(newBox1Wages)) < 0.01;
          const sameEmployer = existingEmployer && newEmployer && 
                              existingEmployer.toLowerCase().trim() === newEmployer.toLowerCase().trim();

          if (sameBox1Wages && sameEmployer) {
            isDuplicateMatch = true;
            reason = `Duplicate W2 detected: same tax year (${newTaxYear}), employer (${newEmployer}), and wages ($${newBox1Wages})`;
          }
        }
      }

      if (isDuplicateMatch) {
        return { 
          isDuplicate: true, 
          duplicateId: existingDoc.id,
          reason 
        };
      }
    }

    return { isDuplicate: false };
  } catch (error) {
    console.error('Error checking for duplicate documents:', error);
    // If there's an error checking for duplicates, don't block the upload
    return { isDuplicate: false };
  }
}

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

// Helper function to extract Social Security data from Azure layout analyzer
function extractSocialSecurityData(analyzeResult: any) {
  try {
    const content = analyzeResult?.analyzeResult?.content || '';
    const paragraphs = analyzeResult?.analyzeResult?.paragraphs || [];
    
    let beneficiaryName = null;
    let monthlyBenefit = null;
    let letterDate = null;
    
    // Extract beneficiary name (look for name in address line - try multiple patterns)
    let nameMatch = content.match(/([A-Z][A-Z\s]+)\s+\d+\s+[A-Z\s]+\s+[A-Z]{2}\s+\d{5}/);
    if (!nameMatch) {
      // Try alternative pattern: name after codes/numbers but before address
      nameMatch = content.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})+)\s+\d+\s+[A-Z\s]+\s+[A-Z]{2}\s+\d{5}/);
    }
    if (!nameMatch) {
      // Try pattern: P## followed by name
      nameMatch = content.match(/P\d+\s+([A-Z]{2,}(?:\s+[A-Z]{2,})+)\s+\d+/);
    }
    if (!nameMatch) {
      // Try SSA-1099 Box 1 pattern: "Box 1. Name FIRSTNAME LASTNAME"
      nameMatch = content.match(/Box 1\.\s*Name\s+([A-Z\s]+?)(?:\n|Box)/i);
    }
    if (nameMatch) {
      beneficiaryName = nameMatch[1].trim();
    }
    
    // Extract benefit amount (try multiple patterns for different document types)
    let benefitMatch = null;
    let isAnnualAmount = false;
    
    // First, check if this is an SSA-1099 form (annual benefits)
    if (content.includes('SSA-1099') || content.includes('SOCIAL SECURITY BENEFIT STATEMENT')) {
      console.log('[SS EXTRACTION] Detected SSA-1099 form - looking for annual benefits');
      
      // Try to extract from Box 3 (Benefits paid in year) or Box 5 (Net Benefits)
      // Updated patterns to handle spaces and commas: "$11, 420.40"
      benefitMatch = content.match(/Box 5[^$]*\$\s*([0-9,\s]+\.?\d*)/i);
      if (!benefitMatch) {
        benefitMatch = content.match(/Box 3[^$]*\$\s*([0-9,\s]+\.?\d*)/i);
      }
      if (!benefitMatch) {
        benefitMatch = content.match(/Net Benefits[^$]*\$\s*([0-9,\s]+\.?\d*)/i);
      }
      if (!benefitMatch) {
        benefitMatch = content.match(/Benefits paid[^$]*\$\s*([0-9,\s]+\.?\d*)/i);
      }
      
      if (benefitMatch) {
        isAnnualAmount = true;
        console.log('[SS EXTRACTION] Found annual amount in SSA-1099:', benefitMatch[1]);
      }
    }
    
    // If not SSA-1099 or no match found, try monthly benefit patterns (for letters)
    if (!benefitMatch) {
      console.log('[SS EXTRACTION] Looking for monthly benefit amounts (letters)');
      
      benefitMatch = content.match(/monthly Social Security benefit.*?\$([0-9,]+\.?\d*)/i);
      if (!benefitMatch) {
        // Try more flexible pattern: "monthly benefit"
        benefitMatch = content.match(/monthly benefit.*?\$([0-9,]+\.?\d*)/i);
      }
      if (!benefitMatch) {
        // Try pattern: "benefit to $amount"
        benefitMatch = content.match(/benefit to \$([0-9,]+\.?\d*)/i);
      }
      if (!benefitMatch) {
        // Try general dollar amount pattern near benefit context
        benefitMatch = content.match(/(?:benefit|Social Security).*?\$([0-9,]+\.?\d*)/i);
      }
    }
    
    if (benefitMatch) {
      // Clean up the extracted amount - remove commas and extra spaces
      const cleanAmount = benefitMatch[1].replace(/[,\s]/g, '');
      const extractedAmount = parseFloat(cleanAmount);
      
      if (isAnnualAmount) {
        // Convert annual to monthly
        monthlyBenefit = extractedAmount / 12;
        console.log(`[SS EXTRACTION] Converted annual $${extractedAmount} to monthly $${monthlyBenefit}`);
      } else {
        // Already monthly
        monthlyBenefit = extractedAmount;
        console.log(`[SS EXTRACTION] Using monthly amount $${monthlyBenefit}`);
      }
    }
    
    // Extract letter date
    const dateMatch = content.match(/Date:\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/);
    if (dateMatch) {
      letterDate = new Date(dateMatch[1]);
    }
    
    // Return extracted data if we have at least name and benefit
    if (beneficiaryName && monthlyBenefit && monthlyBenefit > 0) {
      return {
        beneficiaryName,
        monthlyBenefit,
        letterDate,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting Social Security data:', error);
    return null;
  }
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
  const residentParts = residentNameLower.split(/[\s,]+/).filter((part: string) => part.length > 1);
  const employeeParts = employeeNameLower.split(/[\s,]+/).filter((part: string) => part.length > 1);

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
  
  // Declare document variable in function scope for error handling
  let document: any = null;
  
  try {
    console.log('🔍 [UPLOAD DEBUG] Starting document upload process');
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      console.log('❌ [UPLOAD DEBUG] Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.log('✅ [UPLOAD DEBUG] Session validated for user:', session.user.id);

    const { verificationId } = await params;
    console.log('🔍 [UPLOAD DEBUG] Verification ID:', verificationId);
    
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as DocumentType;
    const residentId = formData.get('residentId') as string;
    
    console.log('🔍 [UPLOAD DEBUG] Form data:', { 
      fileName: file?.name, 
      fileSize: file?.size, 
      documentType, 
      residentId 
    });
    
    // CRITICAL: Log every single document upload to verify our code is running
    console.log(`🚀 [UPLOAD] ANY DOCUMENT UPLOAD - Type: "${documentType}" | File: ${file?.name} | Time: ${new Date().toISOString()}`);
    const forceUpload = formData.get('forceUpload') === 'true'; // Allow bypassing date check

    if (!file || !documentType || !residentId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify that the user owns this property through the verification
    console.log('🔍 [UPLOAD DEBUG] Querying verification from database...');
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
    
    console.log('🔍 [UPLOAD DEBUG] Verification query result:', {
      found: !!verification,
      leaseId: verification?.Lease?.id,
      unitId: verification?.Lease?.Unit?.id,
      propertyId: verification?.Lease?.Unit?.Property?.id,
      ownerId: verification?.Lease?.Unit?.Property?.ownerId
    });

    if (!verification || verification.Lease?.Unit?.Property?.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Process file from memory and save to Azure Blob Storage
    const buffer = Buffer.from(await file.arrayBuffer());
    const documentId = randomUUID();
    const filename = generateBlobFileName(file.name, documentId);
    
    console.log(`Processing file: ${filename} for verification ${verificationId}, resident ${residentId}`);

    // Create initial document record
    document = await prisma.incomeDocument.create({
      data: {
        id: documentId,
        documentType,
        documentDate: new Date(), // Required field for document date
        uploadDate: new Date(),
        status: DocumentStatus.PROCESSING,
        filePath: filename,
        verificationId,
        residentId,
      },
    });

    // Save file to Azure Blob Storage
    let blobUrl: string | null = null;
    if (isBlobStorageConfigured()) {
      try {
        // Determine content type based on file extension
        const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
        let contentType = 'application/octet-stream';
        
        if (fileExtension === 'pdf') {
          contentType = 'application/pdf';
        } else if (['jpg', 'jpeg'].includes(fileExtension)) {
          contentType = 'image/jpeg';
        } else if (fileExtension === 'png') {
          contentType = 'image/png';
        }

        console.log(`[BLOB STORAGE] Uploading ${filename} to Azure Blob Storage...`);
        blobUrl = await uploadToBlob(filename, buffer, contentType);
        console.log(`[BLOB STORAGE] Successfully uploaded to: ${blobUrl}`);

        // Update document record with blob URL
        await prisma.incomeDocument.update({
          where: { id: document.id },
          data: { 
            filePath: filename, // Keep filename for compatibility
            // We could add a blobUrl field to the schema later if needed
          }
        });
      } catch (blobError) {
        console.error(`[BLOB STORAGE] Failed to upload ${filename}:`, blobError);
        // Continue processing even if blob upload fails - we still have the file in memory for analysis
        console.log(`[BLOB STORAGE] Continuing with document analysis despite blob upload failure`);
      }
    } else {
      console.warn(`[BLOB STORAGE] Azure Blob Storage not configured - file will not be permanently stored`);
    }

    // Analyze the document with Azure Document Intelligence
    let analyzeResult;
    try {
      let modelId: string;
      
      if (documentType === DocumentType.W2) {
        modelId = 'prebuilt-tax.us.w2';
        console.log(`[AZURE MODEL] Using W2 model: ${modelId} for document ${document.id}`);
      } else if (documentType === DocumentType.PAYSTUB) {
        modelId = 'prebuilt-payStub.us';
        console.log(`[AZURE MODEL] Using Paystub model: ${modelId} for document ${document.id}`);
      } else if (documentType === 'SSA_1099') {
        modelId = 'prebuilt-tax.us.1099SSA'; // Use Azure's specific SSA-1099 model
        console.log(`[AZURE MODEL] Using Azure SSA-1099 model: ${modelId} for document ${document.id}`);
      } else if (documentType === DocumentType.SOCIAL_SECURITY) {
        modelId = 'prebuilt-layout'; // Use layout analyzer for general Social Security letters
        console.log(`[AZURE MODEL] Using layout analyzer: ${modelId} for ${documentType} document ${document.id}`);
      } else {
        // Skip Azure analysis for Bank Statement and Offer Letter document types
        const documentTypeLabel = documentType === DocumentType.BANK_STATEMENT ? 'Bank Statement' : 
                                 documentType === DocumentType.OFFER_LETTER ? 'Offer Letter' : documentType;
        console.log(`Skipping Azure analysis for ${documentTypeLabel} - sending directly to admin review`);
        
        // Mark as needing admin review since we can't auto-process
        document = await prisma.incomeDocument.update({
          where: { id: document.id },
          data: {
            status: DocumentStatus.NEEDS_REVIEW,
          }
        });

        // Create override request for manual review
        const userExplanation = documentType === DocumentType.BANK_STATEMENT 
          ? `Bank Statement document requires manual review and income entry by an administrator.`
          : documentType === DocumentType.OFFER_LETTER
          ? `Offer Letter document requires manual review and income entry by an administrator.`
          : `${documentType} document requires manual review and income entry by an administrator.`;
          
        await prisma.overrideRequest.create({
          data: {
            id: randomUUID(),
            type: 'DOCUMENT_REVIEW',
            status: 'PENDING',
            userExplanation,
            documentId: document.id,
            verificationId: verificationId,
            residentId: residentId,
            requesterId: session.user.id,
            propertyId: verification.Lease?.Unit?.Property?.id,
            updatedAt: new Date(),
          }
        });

        return NextResponse.json(document, { status: 201 });
      }

      console.log(`🔍 [UPLOAD DEBUG] Starting Azure AI analysis for document type: ${documentType}`);
      console.log(`🔍 [UPLOAD DEBUG] Azure endpoint configured:`, !!process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT);
      console.log(`🔍 [UPLOAD DEBUG] Azure key configured:`, !!process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
      
      analyzeResult = await analyzeIncomeDocument(buffer, modelId);
      console.log(`Azure analysis completed for document ${document.id} using model ${modelId}`);
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

    // Enhanced logging for layout analyzer data
    console.log(`[DEBUG] Full Azure response structure for document ${document.id}:`, JSON.stringify(analyzeResult, null, 2));
    
    // For layout analyzer, access nested data in analyzeResult
    const nestedResult = analyzeResult?.analyzeResult || analyzeResult;
    if (nestedResult?.pages || nestedResult?.keyValuePairs || nestedResult?.content) {
      console.log(`[DEBUG] Layout analyzer data for document ${document.id}:`);
      
      // Log extracted text content
      if (nestedResult.content) {
        console.log(`Content length: ${nestedResult.content.length} characters`);
        console.log(`Content preview: ${nestedResult.content.substring(0, 500)}...`);
      }

      // Log key-value pairs
      if (nestedResult.keyValuePairs && nestedResult.keyValuePairs.length > 0) {
        console.log(`Found ${nestedResult.keyValuePairs.length} key-value pairs:`);
        nestedResult.keyValuePairs.slice(0, 10).forEach((pair: any, index: number) => {
          console.log(`  ${index + 1}. Key: "${pair.key?.content || 'N/A'}" -> Value: "${pair.value?.content || 'N/A'}"`);
        });
      }

      // Log paragraphs if available
      if (nestedResult.paragraphs && nestedResult.paragraphs.length > 0) {
        console.log(`Found ${nestedResult.paragraphs.length} paragraphs:`);
        nestedResult.paragraphs.slice(0, 10).forEach((para: any, index: number) => {
          console.log(`  ${index + 1}. ${para.content?.substring(0, 100)}...`);
        });
      }
    } else {
      console.log(`[DEBUG] No layout analyzer data found. Available keys:`, Object.keys(nestedResult || {}));
    }

        // Debug: Show exactly what documentType we received
    console.log(`🔍 [DOCUMENT TYPE DEBUG] Received documentType:`, {
      raw: documentType,
      type: typeof documentType,
      isW2: documentType === DocumentType.W2,
      isStringW2: documentType === 'W2',
      DocumentTypeEnum: DocumentType,
      comparison: `"${documentType}" === "${DocumentType.W2}"`
    });

    // Validate Azure extraction results
    let validationResult: PaystubValidationResult | W2ValidationResult | null = null;
    const updateData: any = {};

    if (documentType === DocumentType.PAYSTUB) {
      validationResult = validatePaystubExtraction(analyzeResult);
    } else if (documentType === DocumentType.W2) {
        console.log(`🔥 [W2 UPLOAD] Processing W2 document - this should always appear!`);
        // Debug: Log Azure W2 fields before validation
        const documentsArray = analyzeResult.documents;
        if (documentsArray && documentsArray.length > 0) {
          const fields = documentsArray[0].fields;
          console.log(`[UPLOAD DEBUG] Azure W2 fields available:`, Object.keys(fields || {}));
          console.log(`[UPLOAD DEBUG] Employee-related fields:`, Object.keys(fields || {}).filter(k => 
            k.toLowerCase().includes('employee') || k.toLowerCase().includes('name')));
          console.log(`[UPLOAD DEBUG] Employer-related fields:`, Object.keys(fields || {}).filter(k => 
            k.toLowerCase().includes('employer') || k.toLowerCase().includes('company')));
        }
        validationResult = validateW2Extraction(analyzeResult);
            } else if (documentType === 'SSA_1099') {
          // Handle structured SSA-1099 response from Azure prebuilt model
          const extractedData = analyzeResult?.analyzeResult?.documents?.[0]?.fields;
          
          if (extractedData) {
            console.log('[SSA-1099] Using Azure prebuilt model structured extraction');
            console.log('[SSA-1099] Available fields from Azure:', Object.keys(extractedData));
            console.log('[SSA-1099] Full extracted data:', JSON.stringify(extractedData, null, 2));
            
            // Extract structured fields from SSA-1099 model using correct Azure field names
            let beneficiaryName = extractedData.Beneficiary?.valueObject?.Name?.content || 
                                  extractedData.Beneficiary?.content || 
                                  extractedData.Box1?.content || 
                                  extractedData.BeneficiaryName?.content ||
                                  extractedData.EmployeeName?.content ||
                                  extractedData.RecipientName?.content;
            const annualBenefits = extractedData.Box5?.content || extractedData.Box3?.content;
            const taxYear = extractedData.TaxYear?.content;
            
            console.log('[SSA-1099] Extraction attempts:', {
              beneficiaryName,
              annualBenefits,
              taxYear
            });
            
            // If name extraction failed, try alternative access patterns
            if (!beneficiaryName) {
              console.log('[SSA-1099] Name extraction failed. All available fields:', Object.keys(extractedData));
              
              // Try alternative extraction methods for beneficiary name
              let alternativeName = null;
              
              if (extractedData.Beneficiary) {
                console.log('[SSA-1099] Trying alternative Beneficiary access patterns...');
                
                // Try direct content access
                alternativeName = extractedData.Beneficiary.content;
                if (alternativeName) console.log('[SSA-1099] Found name via Beneficiary.content:', alternativeName);
                
                // Try valueString access  
                if (!alternativeName) {
                  alternativeName = extractedData.Beneficiary.valueString;
                  if (alternativeName) console.log('[SSA-1099] Found name via Beneficiary.valueString:', alternativeName);
                }
                
                // Try valueObject.Name access
                if (!alternativeName && extractedData.Beneficiary.valueObject?.Name) {
                  alternativeName = extractedData.Beneficiary.valueObject.Name.content || 
                                   extractedData.Beneficiary.valueObject.Name.valueString;
                  if (alternativeName) console.log('[SSA-1099] Found name via Beneficiary.valueObject.Name:', alternativeName);
                }
              }
              
              // If we found an alternative name, use it
              if (alternativeName) {
                beneficiaryName = alternativeName;
                console.log('[SSA-1099] Successfully extracted beneficiary name using alternative method:', beneficiaryName);
              } else {
                console.log('[SSA-1099] Could not extract beneficiary name through any method');
              }
            }
            
            console.log('[SSA-1099] Final extraction check:', {
              beneficiaryName: !!beneficiaryName,
              beneficiaryNameValue: beneficiaryName,
              annualBenefits: !!annualBenefits,
              annualBenefitsValue: annualBenefits,
              taxYear: taxYear
            });
            
            if (beneficiaryName && annualBenefits) {
              // Remove currency formatting from the benefits amount
              const cleanBenefits = annualBenefits.replace(/[$,]/g, '');
              const parsedAmount = parseFloat(cleanBenefits);
              const monthlyBenefit = !isNaN(parsedAmount) ? parsedAmount / 12 : null;
              const annualizedIncome = !isNaN(parsedAmount) ? parsedAmount : null;
              
              console.log(`[SSA-1099] Extracted: ${beneficiaryName}, Annual: $${annualBenefits}, Monthly: $${monthlyBenefit}`);
              
              // Apply the extracted data immediately
              let documentDate = new Date(); // Default to current date
              if (taxYear) {
                try {
                  // Validate taxYear is a 4-digit number
                  const yearNum = parseInt(taxYear.toString());
                  if (!isNaN(yearNum) && yearNum >= 1900 && yearNum <= 2100) {
                    documentDate = new Date(`${yearNum}-12-31`);
                  } else {
                    console.log(`[SSA-1099] Invalid taxYear format: ${taxYear}, using current date`);
                  }
                } catch (error) {
                  console.log(`[SSA-1099] Error parsing taxYear: ${taxYear}, using current date:`, error);
                }
              }
              
              const updateData: any = {
                employeeName: beneficiaryName ?? null,
                grossPayAmount: monthlyBenefit ?? null,
                payFrequency: 'MONTHLY',
                calculatedAnnualizedIncome: annualizedIncome ?? null,
                status: DocumentStatus.COMPLETED,
                documentDate: documentDate
              };

              try {
                document = await prisma.incomeDocument.update({
                  where: { id: document.id },
                  data: updateData
                });

                console.log(`[SSA-1099] Document ${document.id} successfully processed and marked as COMPLETED`);
                return NextResponse.json(document, { status: 201 });
              } catch (prismaError: any) {
                console.error(`[SSA-1099] Prisma update error for document ${document.id}:`, prismaError);
                console.error(`[SSA-1099] UpdateData that caused error:`, JSON.stringify(updateData, null, 2));
                throw new Error(`Database update failed: ${prismaError?.message || 'Unknown database error'}`);
              }
            } else {
              console.log('[SSA-1099] Could not extract required fields, marking for review');
              
              // Mark as needing admin review
              document = await prisma.incomeDocument.update({
                where: { id: document.id },
                data: { status: DocumentStatus.NEEDS_REVIEW }
              });

              // Create override request for manual review
              await prisma.overrideRequest.create({
                data: {
                  id: randomUUID(),
                  type: 'DOCUMENT_REVIEW',
                  status: 'PENDING',
                  userExplanation: 'SSA-1099 document could not be automatically processed. Please manually review and enter the income information.',
                  documentId: document.id,
                  verificationId: verificationId,
                  residentId: residentId,
                  requesterId: session.user.id,
                  propertyId: verification.Lease?.Unit?.Property?.id,
                  updatedAt: new Date(),
                }
              });

              console.log(`[SSA-1099] Document ${document.id} marked for admin review`);
              return NextResponse.json(document, { status: 201 });
            }
          } else {
            console.log('[SSA-1099] No structured data found, marking for review');
            
            // Mark as needing admin review
            document = await prisma.incomeDocument.update({
              where: { id: document.id },
              data: { status: DocumentStatus.NEEDS_REVIEW }
            });

            // Create override request for manual review
            await prisma.overrideRequest.create({
              data: {
                id: randomUUID(),
                type: 'DOCUMENT_REVIEW',
                status: 'PENDING',
                userExplanation: 'SSA-1099 document analysis failed. Please manually review and enter the income information.',
                documentId: document.id,
                verificationId: verificationId,
                residentId: residentId,
                requesterId: session.user.id,
                propertyId: verification.Lease?.Unit?.Property?.id,
                updatedAt: new Date(),
              }
            });

            console.log(`[SSA-1099] Document ${document.id} marked for admin review due to analysis failure`);
            return NextResponse.json(document, { status: 201 });
          }
        } else if (documentType === DocumentType.SOCIAL_SECURITY || 
                   documentType === DocumentType.BANK_STATEMENT || 
                   documentType === DocumentType.OFFER_LETTER ||
                   documentType === 'OTHER') {
          
          // Try to extract key information automatically for high-confidence cases
          let autoExtractedData = null;
          let shouldAutoVerify = false;

          if (documentType === DocumentType.SOCIAL_SECURITY) {
            // Extract Social Security benefit information
            autoExtractedData = extractSocialSecurityData(analyzeResult);
            shouldAutoVerify = !!(autoExtractedData && autoExtractedData.monthlyBenefit > 0);
            
            console.log(`Social Security auto-extraction result:`, {
              extracted: !!autoExtractedData,
              shouldAutoVerify,
              monthlyBenefit: autoExtractedData?.monthlyBenefit,
              beneficiaryName: autoExtractedData?.beneficiaryName
            });
          }

          if (shouldAutoVerify && autoExtractedData) {
            // Auto-verify with extracted data
            console.log(`${documentType} document auto-verified with extracted data`);
            
            const annualizedIncome = (autoExtractedData.monthlyBenefit ?? 0) * 12;
            
            document = await prisma.incomeDocument.update({
              where: { id: document.id },
              data: {
                status: DocumentStatus.COMPLETED,
                employeeName: autoExtractedData.beneficiaryName ?? null,
                grossPayAmount: autoExtractedData.monthlyBenefit ?? null,
                payFrequency: 'MONTHLY',
                calculatedAnnualizedIncome: annualizedIncome,
                documentDate: autoExtractedData.letterDate || new Date(),
              }
            });

            return NextResponse.json(document, { status: 201 });
          } else {
            // Fall back to admin review for all document types that use the generic layout model
            const documentTypeLabel = documentType || 'Other';
            console.log(`${documentTypeLabel} document analyzed with layout model - marking for admin review`);
            
            document = await prisma.incomeDocument.update({
              where: { id: document.id },
              data: {
                status: DocumentStatus.NEEDS_REVIEW,
              }
            });

            // Create override request for manual review
                        const userExplanation = `${documentType || 'Other'} document has been processed by Azure's layout analyzer. Please manually review and enter the income information.`;

            await prisma.overrideRequest.create({
              data: {
                id: randomUUID(),
                type: 'DOCUMENT_REVIEW',
                status: 'PENDING',
                userExplanation,
                documentId: document.id,
                verificationId: verificationId,
                residentId: residentId,
                requesterId: session.user.id,
                propertyId: verification.Lease?.Unit?.Property?.id,
                updatedAt: new Date(),
              }
            });

            return NextResponse.json(document, { status: 201 });
          }
    } else {
      return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 });
    }

    // Handle validation results (only for W2 and Paystub documents)
    if (validationResult) {
      console.log(`Validation result for document ${document.id}:`, {
        isValid: validationResult.isValid,
        needsAdminReview: validationResult.needsAdminReview,
        confidence: validationResult.confidence,
        warningsCount: validationResult.warnings.length,
        errorsCount: validationResult.errors.length
      });

      if (!validationResult.isValid || validationResult.needsAdminReview) {
      // Log detailed validation failure information
      console.log(`[VALIDATION FAILURE] Document ${document.id} (${documentType}) failed validation:`, {
        isValid: validationResult.isValid,
        needsAdminReview: validationResult.needsAdminReview,
        confidence: validationResult.confidence,
        errors: validationResult.errors,
        warnings: validationResult.warnings,
        extractedData: validationResult.extractedData
      });

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

        console.log(`Created validation override request for document ${document.id}: ${explanation}`);
      } catch (overrideError) {
        console.error('Failed to create auto-override request for validation issues:', overrideError);
      }

      return NextResponse.json(document, { status: 201 });
    }

    // Validation passed - now check for duplicates before proceeding (unless forceUpload is true)
    if (!forceUpload) {
      console.log(`🔍 [DUPLICATE CHECK] Starting duplicate check for resident ${residentId}, document type: ${documentType}`);
      console.log(`🔍 [DUPLICATE CHECK] Extracted data for comparison:`, JSON.stringify(validationResult.extractedData, null, 2));
      
      const duplicateCheck = await checkForDuplicateDocument(residentId, documentType, validationResult.extractedData);
      
      console.log(`🔍 [DUPLICATE CHECK] Result:`, duplicateCheck);
      
      if (duplicateCheck.isDuplicate) {
        console.log(`❌ [DUPLICATE DETECTED] Blocking upload for resident ${residentId}: ${duplicateCheck.reason}`);
        
        // Delete the newly created document since it's a duplicate
        await prisma.incomeDocument.delete({
          where: { id: document.id }
        });
        
        return NextResponse.json(
          { 
            error: 'Duplicate document detected', 
            message: duplicateCheck.reason,
            duplicateDocumentId: duplicateCheck.duplicateId
          }, 
          { status: 409 } // Conflict status code
        );
      }
      
      console.log(`✅ [DUPLICATE CHECK] No duplicates found, proceeding with upload for resident ${residentId}`);
    } else {
      console.log(`⚠️ [DUPLICATE CHECK] Skipping duplicate check due to forceUpload flag for resident ${residentId}`);
    }

    // No duplicates found - continue with timeliness and name matching validation
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
        
        // eslint-disable-next-line prefer-const
        let updateData: any = {
          status: DocumentStatus.COMPLETED,
          box1_wages: extractedData.box1_wages ?? null,
          box3_ss_wages: extractedData.box3_ss_wages ?? null,
          box5_med_wages: extractedData.box5_med_wages ?? null,
          employeeName: extractedData.employeeName ?? null,
          employerName: extractedData.employerName ?? null,
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
        
        // eslint-disable-next-line prefer-const
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
              ? ((validationResult as W2ValidationResult).extractedData.taxYear ? 
                  parseInt((validationResult as W2ValidationResult).extractedData.taxYear!, 10) : null)
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

    // Collect validation issues (declare outside if block so it's accessible later)
    const issues = [];
    if (!timelinessCheck.isValid) {
      issues.push(timelinessCheck.reason || 'Timeliness check failed');
    }
    if (!nameCheck.isValid) {
      issues.push(nameCheck.reason || 'Name check failed');
    }

    if (!timelinessCheck.isValid || !nameCheck.isValid) {

      // Mark document as needing review due to validation issues
      document = await prisma.incomeDocument.update({
        where: { id: document.id },
        data: {
          status: DocumentStatus.NEEDS_REVIEW,
          // Still save the extracted data for admin review
          ...(documentType === DocumentType.W2 ? {
            box1_wages: (validationResult as W2ValidationResult).extractedData.box1_wages ?? null,
            box3_ss_wages: (validationResult as W2ValidationResult).extractedData.box3_ss_wages ?? null,
            box5_med_wages: (validationResult as W2ValidationResult).extractedData.box5_med_wages ?? null,
            employeeName: (validationResult as W2ValidationResult).extractedData.employeeName ?? null,
            employerName: (validationResult as W2ValidationResult).extractedData.employerName ?? null,
            taxYear: (validationResult as W2ValidationResult).extractedData.taxYear ? 
              parseInt((validationResult as W2ValidationResult).extractedData.taxYear!, 10) : null
          } : {
            payPeriodStartDate: (validationResult as PaystubValidationResult).extractedData.payPeriodStartDate ?? null,
            payPeriodEndDate: (validationResult as PaystubValidationResult).extractedData.payPeriodEndDate ?? null,
            grossPayAmount: (validationResult as PaystubValidationResult).extractedData.grossPayAmount ?? null,
            employeeName: (validationResult as PaystubValidationResult).extractedData.employeeName ?? null,
            employerName: (validationResult as PaystubValidationResult).extractedData.employerName ?? null
          })
        }
      });

      // Create simplified explanation for admin review
      const explanation = 'Document requires manual review and verification by an administrator.';

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
            box1_wages: extractedData.box1_wages ?? null,
            box3_ss_wages: extractedData.box3_ss_wages ?? null,
            box5_med_wages: extractedData.box5_med_wages ?? null,
            employeeName: extractedData.employeeName ?? null,
            employerName: extractedData.employerName ?? null,
            taxYear: extractedData.taxYear ? parseInt(extractedData.taxYear, 10) : null,
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
            payPeriodStartDate: extractedData.payPeriodStartDate ?? null,
            payPeriodEndDate: extractedData.payPeriodEndDate ?? null,
            grossPayAmount: extractedData.grossPayAmount ?? null,
            employeeName: extractedData.employeeName ?? null,
            employerName: extractedData.employerName ?? null,
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
    } // Close the validationResult if block

    return NextResponse.json(document, { status: 201 });

  } catch (error) {
    console.error('❌ [UPLOAD DEBUG] Error uploading document:', error);
    console.error('❌ [UPLOAD DEBUG] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('❌ [UPLOAD DEBUG] Error message:', error instanceof Error ? error.message : String(error));
    
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

        // Create override request for the error recovery case
        // Note: We need to get session again since it's not in scope in the catch block
        try {
          const errorSession = await getServerSession(authOptions);
          if (errorSession?.user?.id) {
            await prisma.overrideRequest.create({
              data: {
                id: randomUUID(),
                type: 'DOCUMENT_REVIEW',
                status: 'PENDING',
                userExplanation: `Document processing encountered an error and requires manual review. Error: ${error instanceof Error ? error.message : 'Unknown processing error'}`,
                documentId: document.id,
                verificationId: document.verificationId,
                residentId: document.residentId,
                requesterId: errorSession.user.id,
                propertyId: null, // We don't have access to verification object in error scope
                updatedAt: new Date(),
              }
            });
            console.log(`✅ [RECOVERY] Created override request for document ${document.id}`);
          } else {
            console.log(`⚠️ [RECOVERY] Could not create override request - no session available`);
          }
        } catch (overrideError) {
          console.error(`❌ [RECOVERY] Failed to create override request for document ${document.id}:`, overrideError);
        }
        
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