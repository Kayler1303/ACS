import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { analyzeIncomeDocument } from '@/services/azureAi';
import { validatePaystubExtraction, validateW2Extraction, PaystubValidationResult, W2ValidationResult } from '@/services/azureValidation';
import { addMonths } from 'date-fns';
import { DocumentType } from '@prisma/client';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ verificationId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { verificationId } = await params;

  try {
    const formData = await req.formData();
    
    // Get all files from the form data
    const files: File[] = [];
    const documentTypes: string[] = [];
    
    // FormData can have multiple files with same key name
    const fileEntries = formData.getAll('files') as File[];
    const typeEntries = formData.getAll('documentTypes') as string[];
    
    for (let i = 0; i < fileEntries.length; i++) {
      if (fileEntries[i] && typeEntries[i]) {
        files.push(fileEntries[i]);
        documentTypes.push(typeEntries[i]);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Get verification and lease info for date comparison
    const verification = await prisma.incomeVerification.findUnique({
      where: { id: verificationId },
      include: {
        Lease: {
          select: {
            leaseStartDate: true,
            name: true,
            Unit: {
              include: {
                Property: {
                  select: {
                    ownerId: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!verification) {
      return NextResponse.json({ error: 'Verification not found' }, { status: 404 });
    }

    // Security check
    if (verification.Lease.Unit.Property.ownerId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const lease = verification.Lease;

    // If future lease (no start date), no date check needed
    if (!lease.leaseStartDate) {
      return NextResponse.json({
        requiresDateConfirmation: false,
        message: 'Future lease - no date validation required'
      });
    }

    const leaseStartDate = new Date(lease.leaseStartDate);
    const fiveMonthsAfterStart = addMonths(leaseStartDate, 5);
    
    // Process all files and extract dates
    const documentDates: Date[] = [];
    let readableDocumentCount = 0;
    let totalDocumentCount = files.length;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const documentType = documentTypes[i];
      
      try {
        // Convert file to buffer for Azure analysis
        const buffer = Buffer.from(await file.arrayBuffer());

        // Analyze the document with Azure Document Intelligence
        const modelId = documentType === DocumentType.W2 ? 'prebuilt-tax.us.w2' : 'prebuilt-payStub.us';
        const analyzeResult = await analyzeIncomeDocument(buffer, modelId);
        
        // Validate Azure extraction results
        let validationResult: PaystubValidationResult | W2ValidationResult;

        if (documentType === DocumentType.PAYSTUB) {
          validationResult = validatePaystubExtraction(analyzeResult);
        } else if (documentType === DocumentType.W2) {
          validationResult = validateW2Extraction(analyzeResult);
        } else {
          continue; // Skip unsupported types
        }

        if (validationResult.isValid) {
          readableDocumentCount++;
          
          // Extract document date
          let documentDate: Date | null = null;
          
          if (documentType === DocumentType.PAYSTUB) {
            const paystubResult = validationResult as PaystubValidationResult;
            if (paystubResult.extractedData?.payPeriodEndDate) {
              documentDate = new Date(paystubResult.extractedData.payPeriodEndDate);
            }
          } else if (documentType === DocumentType.W2) {
            const w2Result = validationResult as W2ValidationResult;
            if (w2Result.extractedData?.taxYear) {
              documentDate = new Date(parseInt(w2Result.extractedData.taxYear), 11, 31);
            }
          }
          
          if (documentDate) {
            documentDates.push(documentDate);
          }
        }
        
      } catch (error) {
        console.error(`Failed to process file ${file.name}:`, error);
        // Continue processing other files
      }
    }

    console.log(`📊 Date check results: ${readableDocumentCount}/${totalDocumentCount} documents readable, ${documentDates.length} dates extracted`);

    // If no documents were readable, proceed normally (can't determine dates)
    if (readableDocumentCount === 0) {
      return NextResponse.json({
        requiresDateConfirmation: false,
        message: 'No documents could be read - proceeding with normal upload'
      });
    }

    // Check if ANY document date is > 5 months after lease start
    const futureDocuments = documentDates.filter(date => date > fiveMonthsAfterStart);
    
    if (futureDocuments.length > 0) {
      // Find the latest document date to show in modal
      const latestDate = new Date(Math.max(...futureDocuments.map(d => d.getTime())));
      const monthsDifference = Math.floor(
        (latestDate.getTime() - leaseStartDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      return NextResponse.json({
        requiresDateConfirmation: true,
        leaseStartDate: leaseStartDate.toISOString(),
        documentDate: latestDate.toISOString(),
        monthsDifference,
        message: `${futureDocuments.length} of ${documentDates.length} readable documents are from ${monthsDifference} months after lease start - confirmation required`,
        reason: 'date_discrepancy'
      });
    }

    // All readable documents are within acceptable range
    return NextResponse.json({
      requiresDateConfirmation: false,
      message: `All ${documentDates.length} readable documents are within acceptable date range`
    });

  } catch (error) {
    console.error('Error checking document dates:', error);
    return NextResponse.json(
      { error: 'Failed to check document dates' },
      { status: 500 }
    );
  }
} 