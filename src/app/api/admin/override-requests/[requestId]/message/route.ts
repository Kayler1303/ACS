import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';
import AdminMessageEmail from '@/emails/AdminMessageEmail';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await params;
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin
    const admin = await (prisma.user as any).findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, role: true }
    });
    
    if (admin?.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { subject, message } = await request.json();

    if (!subject || !message) {
      return NextResponse.json({ error: 'Subject and message are required' }, { status: 400 });
    }

    // Get the override request with all related data
    const overrideRequest = await prisma.overrideRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: {
          select: { id: true, email: true, name: true }
        },
        unit: {
          include: {
            property: {
              select: { name: true }
            }
          }
        }
      }
    });

    if (!overrideRequest) {
      return NextResponse.json({ error: 'Override request not found' }, { status: 404 });
    }

    // Create the admin message record
    const adminMessage = await prisma.adminMessage.create({
      data: {
        subject,
        message,
        overrideRequestId: requestId,
        adminId: admin.id,
        recipientId: overrideRequest.requesterId
      }
    });

    // Send email notification
    const userFirstName = overrideRequest.requester.name?.split(' ')[0] || 'there';
    
    try {
      await resend.emails.send({
        from: 'Apartment Compliance Services <noreply@apartmentcompliance.com>',
        to: [overrideRequest.requester.email],
        subject: `Admin Message: ${subject}`,
        react: AdminMessageEmail({
          adminName: admin.name || 'Admin',
          userFirstName,
          subject,
          message,
          overrideRequestType: overrideRequest.type,
          propertyName: overrideRequest.unit?.property?.name,
          unitNumber: overrideRequest.unit?.unitNumber
        })
      });
    } catch (emailError) {
      console.error('Failed to send email:', emailError);
      // Continue anyway - the message is saved in the database
    }

    return NextResponse.json({ 
      success: true, 
      messageId: adminMessage.id,
      message: 'Message sent successfully'
    });

  } catch (error) {
    console.error('Error sending admin message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 