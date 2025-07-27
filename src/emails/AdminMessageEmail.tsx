import React from 'react';

interface AdminMessageEmailProps {
  adminName: string;
  userFirstName: string;
  subject: string;
  message: string;
  overrideRequestType: string;
  propertyName?: string;
  unitNumber?: string;
}

export default function AdminMessageEmail({
  adminName,
  userFirstName,
  subject,
  message,
  overrideRequestType,
  propertyName,
  unitNumber
}: AdminMessageEmailProps) {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h2 style={{ color: '#333', marginBottom: '10px' }}>Message from Admin</h2>
        <p style={{ color: '#666', fontSize: '14px', margin: '0' }}>
          Regarding your override request {propertyName && unitNumber && `for ${propertyName} - Unit ${unitNumber}`}
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '16px', color: '#333' }}>
          Hi {userFirstName},
        </p>
        
        <p style={{ fontSize: '16px', color: '#333', lineHeight: '1.5' }}>
          You've received a message from <strong>{adminName}</strong> regarding your {overrideRequestType.toLowerCase().replace('_', ' ')} override request.
        </p>
      </div>

      <div style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px', padding: '20px', marginBottom: '20px' }}>
        <h3 style={{ color: '#333', marginTop: '0', fontSize: '18px' }}>{subject}</h3>
        <div style={{ fontSize: '16px', color: '#333', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
          {message}
        </div>
      </div>

      <div style={{ backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <p style={{ fontSize: '14px', color: '#666', margin: '0' }}>
          <strong>Next Steps:</strong> Please log into your account to view the full details of your override request and respond if needed.
        </p>
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <a 
          href={process.env.NEXTAUTH_URL || 'http://localhost:3001'}
          style={{
            backgroundColor: '#0066cc',
            color: 'white',
            padding: '12px 24px',
            textDecoration: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 'bold'
          }}
        >
          View Your Account
        </a>
      </div>

      <div style={{ marginTop: '30px', borderTop: '1px solid #e5e5e5', paddingTop: '20px' }}>
        <p style={{ fontSize: '12px', color: '#999', textAlign: 'center' }}>
          This message was sent from Apartment Compliance Services. If you have questions, please contact support.
        </p>
      </div>
    </div>
  );
} 