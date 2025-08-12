import { Resend } from 'resend';
import AdminDecisionEmail from '@/emails/AdminDecisionEmail';

const resend = new Resend(process.env.RESEND_API_KEY);

interface AdminDecisionNotificationData {
  adminName: string;
  userEmail: string;
  userFirstName: string;
  decision: 'APPROVED' | 'DENIED';
  adminNotes: string;
  overrideRequestType: string;
  propertyName?: string;
  unitNumber?: string;
  documentType?: string;
  residentName?: string;
}

export async function sendAdminDecisionNotification(data: AdminDecisionNotificationData) {
  try {
    const {
      adminName,
      userEmail,
      userFirstName,
      decision,
      adminNotes,
      overrideRequestType,
      propertyName,
      unitNumber,
      documentType,
      residentName
    } = data;

    const isApproved = decision === 'APPROVED';
    const subjectPrefix = isApproved ? '✅ Request Approved' : '❌ Request Denied';
    
    const formatRequestType = (type: string) => {
      return type.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    const getContextForSubject = () => {
      if (overrideRequestType === 'DOCUMENT_REVIEW' && documentType) {
        return `${documentType} Document Review`;
      }
      if (overrideRequestType === 'PROPERTY_DELETION' && propertyName) {
        return `Property Deletion (${propertyName})`;
      }
      if (overrideRequestType === 'DUPLICATE_DOCUMENT' && documentType) {
        return `Duplicate ${documentType} Document`;
      }
      return formatRequestType(overrideRequestType);
    };

    const subject = `${subjectPrefix}: ${getContextForSubject()}`;

    console.log(`[EMAIL NOTIFICATION] Sending ${decision} notification to ${userEmail} for ${overrideRequestType}`);

    const emailResult = await resend.emails.send({
      from: 'Apartment Compliance Services <noreply@apartmentcompliance.com>',
      to: [userEmail],
      subject: subject,
      react: AdminDecisionEmail({
        adminName,
        userFirstName,
        decision,
        adminNotes,
        overrideRequestType,
        propertyName,
        unitNumber,
        documentType,
        residentName
      })
    });

    console.log(`[EMAIL NOTIFICATION] Successfully sent ${decision} notification email to ${userEmail}:`, emailResult);
    return { success: true, emailId: emailResult.data?.id };

  } catch (error) {
    console.error('[EMAIL NOTIFICATION] Failed to send admin decision notification:', error);
    
    // Don't throw error - we don't want to fail the admin approval/denial because of email issues
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown email error' 
    };
  }
} 