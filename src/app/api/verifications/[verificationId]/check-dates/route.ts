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
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as string;

    if (!file || !documentType) {
      return NextResponse.json({ error: 'File and document type are required' }, { status: 400 });
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

    // Convert file to buffer for Azure analysis
    const buffer = Buffer.from(await file.arrayBuffer());

    // Analyze the document with Azure Document Intelligence
    let analyzeResult;
    try {
      const modelId = documentType === DocumentType.W2 ? 'prebuilt-tax.us.w2' : 'prebuilt-payStub.us';
      analyzeResult = await analyzeIncomeDocument(buffer, modelId);
    } catch (azureError) {
      console.error('Azure analysis failed for date check:', azureError);
      
      // Since we can't extract dates automatically, ask user to decide
      // This prevents documents from going to wrong lease when Azure fails
      return NextResponse.json({
        requiresDateConfirmation: true,
        leaseStartDate: lease.leaseStartDate,
        documentDate: new Date().toISOString(), // Use current date as placeholder
        monthsDifference: 12, // Arbitrary large number to trigger modal
        message: 'Could not extract date automatically - please confirm which lease these documents are for',
        reason: 'azure_failed'
      });
    }

    // Validate Azure extraction results
    let validationResult: PaystubValidationResult | W2ValidationResult;

    if (documentType === DocumentType.PAYSTUB) {
      validationResult = validatePaystubExtraction(analyzeResult);
    } else if (documentType === DocumentType.W2) {
      validationResult = validateW2Extraction(analyzeResult);
    } else {
      return NextResponse.json({ error: 'Unsupported document type' }, { status: 400 });
    }

    if (!validationResult.isValid) {
      // Similar logic - if validation fails, ask user to decide
      return NextResponse.json({
        requiresDateConfirmation: true,
        leaseStartDate: lease.leaseStartDate,
        documentDate: new Date().toISOString(),
        monthsDifference: 12,
        message: 'Could not extract date reliably - please confirm which lease these documents are for',
        reason: 'validation_failed'
      });
    }

    // Get document date based on type
    let documentDate: Date | null = null;
    
    if (documentType === DocumentType.PAYSTUB) {
      const paystubResult = validationResult as PaystubValidationResult;
      if (paystubResult.extractedData?.payPeriodEndDate) {
        documentDate = new Date(paystubResult.extractedData.payPeriodEndDate);
      }
    } else if (documentType === DocumentType.W2) {
      const w2Result = validationResult as W2ValidationResult;
      if (w2Result.extractedData?.taxYear) {
        // For W2, use December 31 of the tax year
        documentDate = new Date(parseInt(w2Result.extractedData.taxYear), 11, 31);
      }
    }

    if (!documentDate) {
      // If we can't determine document date, ask user to decide
      return NextResponse.json({
        requiresDateConfirmation: true,
        leaseStartDate: lease.leaseStartDate,
        documentDate: new Date().toISOString(),
        monthsDifference: 12,
        message: 'Could not determine document date - please confirm which lease these documents are for',
        reason: 'no_date_found'
      });
    }

    // Check if document is more than 5 months after lease start
    const leaseStartDate = new Date(lease.leaseStartDate);
    const fiveMonthsAfterStart = addMonths(leaseStartDate, 5);
    
    if (documentDate > fiveMonthsAfterStart) {
      const monthsDifference = Math.floor(
        (documentDate.getTime() - leaseStartDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      );

      return NextResponse.json({
        requiresDateConfirmation: true,
        leaseStartDate: leaseStartDate.toISOString(),
        documentDate: documentDate.toISOString(),
        monthsDifference,
        message: `Document date is ${monthsDifference} months after lease start - confirmation required`
      });
    }

    return NextResponse.json({
      requiresDateConfirmation: false,
      message: 'Document date is within acceptable range'
    });

  } catch (error) {
    console.error('Error checking document dates:', error);
    return NextResponse.json(
      { error: 'Failed to check document dates' },
      { status: 500 }
    );
  }
} 