import React from 'react';

interface AdminDecisionEmailProps {
  adminName: string;
  userFirstName: string;
  decision: 'APPROVED' | 'DENIED';
  adminNotes: string;
  overrideRequestType: string;
  propertyName?: string;
  unitNumber?: string;
  documentType?: string;
  residentName?: string;
}

export default function AdminDecisionEmail({
  adminName,
  userFirstName,
  decision,
  adminNotes,
  overrideRequestType,
  propertyName,
  unitNumber,
  documentType,
  residentName
}: AdminDecisionEmailProps) {
  const isApproved = decision === 'APPROVED';
  const statusColor = isApproved ? '#16a34a' : '#dc2626';
  const statusBgColor = isApproved ? '#f0fdf4' : '#fef2f2';
  const statusText = isApproved ? 'Approved' : 'Denied';

  const formatRequestType = (type: string) => {
    return type.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getRequestContext = () => {
    if (overrideRequestType === 'DOCUMENT_REVIEW' && documentType && residentName) {
      return `${documentType} document for ${residentName}`;
    }
    if (overrideRequestType === 'PROPERTY_DELETION' && propertyName) {
      return `deletion of property "${propertyName}"`;
    }
    if (overrideRequestType === 'DUPLICATE_DOCUMENT' && documentType && residentName) {
      return `duplicate ${documentType} document for ${residentName}`;
    }
    if (overrideRequestType === 'INCOME_DISCREPANCY' && residentName) {
      return `income discrepancy for ${residentName}`;
    }
    if (overrideRequestType === 'VALIDATION_EXCEPTION' && residentName) {
      return `validation exception for ${residentName}`;
    }
    return formatRequestType(overrideRequestType);
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2 style={{ color: '#333', marginBottom: '10px' }}>Override Request {statusText}</h2>
        <p style={{ color: '#666', fontSize: '14px', margin: '0' }}>
          Your request has been reviewed and {isApproved ? 'approved' : 'denied'} by an administrator
        </p>
      </div>

      {/* Status Badge */}
      <div style={{ 
        backgroundColor: statusBgColor, 
        border: `1px solid ${statusColor}`, 
        borderRadius: '8px', 
        padding: '15px', 
        marginBottom: '20px',
        textAlign: 'center' as const
      }}>
        <div style={{ 
          color: statusColor, 
          fontSize: '18px', 
          fontWeight: 'bold',
          marginBottom: '5px'
        }}>
          {isApproved ? '✅' : '❌'} Request {statusText}
        </div>
        <div style={{ color: statusColor, fontSize: '14px' }}>
          {getRequestContext()}
          {propertyName && unitNumber && ` (${propertyName} - Unit ${unitNumber})`}
        </div>
      </div>

      {/* Greeting */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '16px', color: '#333' }}>
          Hi {userFirstName},
        </p>
        
        <p style={{ fontSize: '16px', color: '#333', lineHeight: '1.5' }}>
          Your {formatRequestType(overrideRequestType)} override request has been <strong>{isApproved ? 'approved' : 'denied'}</strong> by <strong>{adminName}</strong>.
        </p>
      </div>

      {/* Admin Notes */}
      <div style={{ 
        backgroundColor: '#fff', 
        border: '1px solid #e5e5e5', 
        borderRadius: '8px', 
        padding: '20px', 
        marginBottom: '20px' 
      }}>
        <h3 style={{ color: '#333', marginTop: '0', fontSize: '18px' }}>
          {isApproved ? 'Admin Approval Notes:' : 'Reason for Denial:'}
        </h3>
        <div style={{ 
          fontSize: '16px', 
          color: '#333', 
          lineHeight: '1.6', 
          whiteSpace: 'pre-wrap' as const
        }}>
          {adminNotes}
        </div>
      </div>

      {/* Next Steps */}
      <div style={{ 
        backgroundColor: isApproved ? '#f0fdf4' : '#fef2f2', 
        border: `1px solid ${statusColor}`,
        borderRadius: '8px', 
        padding: '15px', 
        marginBottom: '20px' 
      }}>
        <p style={{ fontSize: '14px', color: statusColor, margin: '0', fontWeight: 'bold' }}>
          <strong>Next Steps:</strong>
        </p>
        <p style={{ fontSize: '14px', color: statusColor, margin: '10px 0 0 0' }}>
          {isApproved ? (
            overrideRequestType === 'DOCUMENT_REVIEW' 
              ? 'Your document has been processed and approved. The verified income has been updated in your property records.'
              : overrideRequestType === 'PROPERTY_DELETION'
              ? 'Your property has been successfully deleted from the system.'
              : overrideRequestType === 'DUPLICATE_DOCUMENT'
              ? 'Your document upload override has been approved. You may now proceed with your document upload.'
              : 'Your override request has been approved and the necessary changes have been applied to your account.'
          ) : (
            overrideRequestType === 'DOCUMENT_REVIEW'
              ? 'Please review the reason above and consider re-uploading your document with corrections, or contact support if you need assistance.'
              : overrideRequestType === 'DUPLICATE_DOCUMENT'
              ? 'The system correctly identified this as a duplicate document. Please check your existing documents or contact support if you believe this is an error.'
              : 'Please review the reason above and take appropriate action. You may submit a new request if needed or contact support for assistance.'
          )}
        </p>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center' as const, marginTop: '30px' }}>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
          Need help? Contact our support team
        </p>
        <div style={{ fontSize: '12px', color: '#999', borderTop: '1px solid #eee', paddingTop: '15px' }}>
          This is an automated notification from Apartment Compliance Services
        </div>
      </div>
    </div>
  );
} 