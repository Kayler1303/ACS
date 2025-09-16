/**
 * Email Service for Payment Notifications and Alerts
 * Supports multiple email providers (Resend, SendGrid, etc.)
 */

interface EmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}

/**
 * Send email using configured email provider
 */
export async function sendEmail(options: EmailOptions): Promise<void> {
  const emailProvider = process.env.EMAIL_PROVIDER || 'resend';
  
  switch (emailProvider.toLowerCase()) {
    case 'resend':
      return sendEmailWithResend(options);
    case 'sendgrid':
      return sendEmailWithSendGrid(options);
    default:
      console.warn(`Email provider '${emailProvider}' not supported. Logging email instead.`);
      logEmail(options);
  }
}

/**
 * Send email using Resend (recommended)
 */
async function sendEmailWithResend(options: EmailOptions): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    console.warn('RESEND_API_KEY not configured. Logging email instead.');
    logEmail(options);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: options.from || 'alerts@apartmentcompliance.com',
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Resend API error: ${response.status} ${error}`);
    }

    console.log(`Email sent successfully via Resend to ${options.to}`);
  } catch (error) {
    console.error('Failed to send email via Resend:', error);
    // Fallback to logging
    logEmail(options);
    throw error;
  }
}

/**
 * Send email using SendGrid
 */
async function sendEmailWithSendGrid(options: EmailOptions): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  
  if (!apiKey) {
    console.warn('SENDGRID_API_KEY not configured. Logging email instead.');
    logEmail(options);
    return;
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{
          to: Array.isArray(options.to) ? options.to.map(email => ({ email })) : [{ email: options.to }],
        }],
        from: { email: options.from || 'alerts@apartmentcompliance.com' },
        subject: options.subject,
        content: [
          ...(options.html ? [{ type: 'text/html', value: options.html }] : []),
          ...(options.text ? [{ type: 'text/plain', value: options.text }] : []),
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`SendGrid API error: ${response.status} ${error}`);
    }

    console.log(`Email sent successfully via SendGrid to ${options.to}`);
  } catch (error) {
    console.error('Failed to send email via SendGrid:', error);
    // Fallback to logging
    logEmail(options);
    throw error;
  }
}

/**
 * Log email instead of sending (for development/fallback)
 */
function logEmail(options: EmailOptions): void {
  console.log('📧 EMAIL LOG:', {
    to: options.to,
    subject: options.subject,
    html: options.html?.substring(0, 200) + '...',
    text: options.text?.substring(0, 200) + '...',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send payment failure notification to customer
 */
export async function sendPaymentFailureNotification(
  customerEmail: string,
  propertyName: string,
  errorMessage: string,
  retryUrl?: string
): Promise<void> {
  const subject = `Payment Failed - ${propertyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Payment Failed</h2>
      
      <p>We were unable to process your payment for <strong>${propertyName}</strong>.</p>
      
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Error:</strong> ${errorMessage}</p>
      </div>
      
      <p>Please update your payment method and try again.</p>
      
      ${retryUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${retryUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Update Payment Method
          </a>
        </div>
      ` : ''}
      
      <p>If you continue to experience issues, please contact our support team.</p>
      
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        Apartment Compliance Solutions<br>
        <a href="mailto:support@apartmentcompliance.com">support@apartmentcompliance.com</a>
      </p>
    </div>
  `;

  await sendEmail({
    to: customerEmail,
    subject,
    html,
  });
}

/**
 * Send payment success confirmation to customer
 */
export async function sendPaymentSuccessNotification(
  customerEmail: string,
  propertyName: string,
  amount: number,
  receiptUrl?: string
): Promise<void> {
  const subject = `Payment Confirmed - ${propertyName}`;
  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #059669;">Payment Confirmed</h2>
      
      <p>Thank you! Your payment for <strong>${propertyName}</strong> has been processed successfully.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Amount:</strong> ${formattedAmount}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
      </div>
      
      <p>Your property access is now active and you can begin using all features.</p>
      
      ${receiptUrl ? `
        <div style="text-align: center; margin: 24px 0;">
          <a href="${receiptUrl}" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
            View Receipt
          </a>
        </div>
      ` : ''}
      
      <p>If you have any questions, please don't hesitate to contact us.</p>
      
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        Apartment Compliance Solutions<br>
        <a href="mailto:support@apartmentcompliance.com">support@apartmentcompliance.com</a>
      </p>
    </div>
  `;

  await sendEmail({
    to: customerEmail,
    subject,
    html,
  });
}

/**
 * Send subscription cancellation notification
 */
export async function sendSubscriptionCancellationNotification(
  customerEmail: string,
  propertyName: string,
  cancellationDate: Date
): Promise<void> {
  const subject = `Subscription Cancelled - ${propertyName}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #dc2626;">Subscription Cancelled</h2>
      
      <p>Your subscription for <strong>${propertyName}</strong> has been cancelled.</p>
      
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
        <p><strong>Cancellation Date:</strong> ${cancellationDate.toLocaleDateString()}</p>
        <p>Your access will continue until the end of your current billing period.</p>
      </div>
      
      <p>If this was unexpected, please contact us immediately.</p>
      
      <div style="text-align: center; margin: 24px 0;">
        <a href="mailto:support@apartmentcompliance.com" 
           style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
          Contact Support
        </a>
      </div>
      
      <hr style="margin: 24px 0; border: none; border-top: 1px solid #e5e7eb;">
      <p style="color: #6b7280; font-size: 14px;">
        Apartment Compliance Solutions<br>
        <a href="mailto:support@apartmentcompliance.com">support@apartmentcompliance.com</a>
      </p>
    </div>
  `;

  await sendEmail({
    to: customerEmail,
    subject,
    html,
  });
}
