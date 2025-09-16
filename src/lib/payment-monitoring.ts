/**
 * Payment Monitoring and Alerting System
 * Provides comprehensive monitoring for Stripe payments and subscriptions
 */

import { prisma } from './prisma';
import { sendEmail } from '@/services/email';

export interface PaymentAlert {
  type: 'PAYMENT_FAILED' | 'WEBHOOK_FAILED' | 'SUBSCRIPTION_CANCELLED' | 'HIGH_FAILURE_RATE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

export interface PaymentMetrics {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalRevenue: number;
  averagePaymentAmount: number;
  failureRate: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
}

/**
 * Log payment events for monitoring and analytics
 */
export async function logPaymentEvent(
  eventType: 'PAYMENT_ATTEMPT' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'SUBSCRIPTION_CREATED' | 'SUBSCRIPTION_CANCELLED',
  data: {
    propertyId?: string;
    customerId?: string;
    amount?: number;
    currency?: string;
    paymentIntentId?: string;
    subscriptionId?: string;
    errorMessage?: string;
    errorCode?: string;
    metadata?: Record<string, any>;
  }
) {
  try {
    // Find or create property subscription to get the ID
    let propertySubscriptionId: string;
    
    if (data.propertyId) {
      const subscription = await prisma.propertySubscription.findUnique({
        where: { propertyId: data.propertyId }
      });
      
      if (subscription) {
        propertySubscriptionId = subscription.id;
      } else {
        // Create a basic subscription record for tracking
        const newSubscription = await prisma.propertySubscription.create({
          data: {
            propertyId: data.propertyId,
            setupType: 'FULL_SERVICE', // Default
            setupFeeAmount: 0,
            monthlyFeeAmount: 0,
          }
        });
        propertySubscriptionId = newSubscription.id;
      }
    } else {
      // Skip logging if no property ID
      console.warn('Cannot log payment event without propertyId');
      return;
    }

    await prisma.paymentTransaction.create({
      data: {
        propertySubscriptionId,
        transactionType: getTransactionType(eventType),
        status: getTransactionStatus(eventType),
        amount: (data.amount || 0) / 100, // Convert from cents to dollars
        currency: data.currency || 'USD',
        stripePaymentIntentId: data.paymentIntentId,
        description: `${eventType}: ${data.errorMessage || 'Payment event'}`,
        metadata: data.metadata || {},
      },
    });

    // Check for alerting conditions
    await checkAlertConditions(eventType, data);
  } catch (error) {
    console.error('Failed to log payment event:', error);
    // Don't throw - logging failures shouldn't break payment flow
  }
}

/**
 * Check if any alert conditions are met and send notifications
 */
async function checkAlertConditions(
  eventType: string,
  data: Record<string, any>
) {
  const alerts: PaymentAlert[] = [];

  // Check for payment failures
  if (eventType === 'PAYMENT_FAILED') {
    alerts.push({
      type: 'PAYMENT_FAILED',
      severity: 'MEDIUM',
      message: `Payment failed for property ${data.propertyId}: ${data.errorMessage}`,
      metadata: data,
      timestamp: new Date(),
    });
  }

  // Check for subscription cancellations
  if (eventType === 'SUBSCRIPTION_CANCELLED') {
    alerts.push({
      type: 'SUBSCRIPTION_CANCELLED',
      severity: 'HIGH',
      message: `Subscription cancelled for property ${data.propertyId}`,
      metadata: data,
      timestamp: new Date(),
    });
  }

  // Check for high failure rate (last 24 hours)
  const failureRate = await getRecentFailureRate();
  if (failureRate > 0.1) { // More than 10% failure rate
    alerts.push({
      type: 'HIGH_FAILURE_RATE',
      severity: 'CRITICAL',
      message: `High payment failure rate detected: ${(failureRate * 100).toFixed(1)}%`,
      metadata: { failureRate, period: '24h' },
      timestamp: new Date(),
    });
  }

  // Send alerts
  for (const alert of alerts) {
    await sendAlert(alert);
  }
}

/**
 * Send alert notifications
 */
async function sendAlert(alert: PaymentAlert) {
  try {
    // Log alert to database
    console.error(`[PAYMENT ALERT] ${alert.severity}: ${alert.message}`, alert.metadata);

    // Send email notification for high severity alerts
    if (alert.severity === 'HIGH' || alert.severity === 'CRITICAL') {
      await sendAlertEmail(alert);
    }

    // TODO: Add Slack/Discord notifications
    // TODO: Add SMS notifications for critical alerts
  } catch (error) {
    console.error('Failed to send payment alert:', error);
  }
}

/**
 * Send alert email to administrators
 */
async function sendAlertEmail(alert: PaymentAlert) {
  const adminEmails = process.env.ADMIN_ALERT_EMAILS?.split(',') || ['admin@apartmentcompliance.com'];
  
  const subject = `🚨 Payment Alert: ${alert.type} - ${alert.severity}`;
  const body = `
    <h2>Payment System Alert</h2>
    <p><strong>Type:</strong> ${alert.type}</p>
    <p><strong>Severity:</strong> ${alert.severity}</p>
    <p><strong>Message:</strong> ${alert.message}</p>
    <p><strong>Time:</strong> ${alert.timestamp.toISOString()}</p>
    
    <h3>Details:</h3>
    <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
    
    <p>Please investigate this issue immediately.</p>
    <p><a href="https://dashboard.stripe.com">View Stripe Dashboard</a></p>
  `;

  for (const email of adminEmails) {
    try {
      await sendEmail({
        to: email.trim(),
        subject,
        html: body,
      });
    } catch (error) {
      console.error(`Failed to send alert email to ${email}:`, error);
    }
  }
}

/**
 * Get payment metrics for the specified period
 */
export async function getPaymentMetrics(
  startDate: Date,
  endDate: Date
): Promise<PaymentMetrics> {
  const transactions = await prisma.paymentTransaction.findMany({
    where: {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const totalPayments = transactions.length;
  const successfulPayments = transactions.filter(t => t.status === 'SUCCEEDED').length;
  const failedPayments = transactions.filter(t => t.status === 'FAILED').length;
  const totalRevenue = transactions
    .filter(t => t.status === 'SUCCEEDED')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  // Analyze failure reasons
  const failureReasons = transactions
    .filter(t => t.status === 'FAILED' && t.description)
    .reduce((acc, t) => {
      const reason = t.description || 'Unknown';
      acc[reason] = (acc[reason] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  const topFailureReasons = Object.entries(failureReasons)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  return {
    totalPayments,
    successfulPayments,
    failedPayments,
    totalRevenue: totalRevenue, // Already in dollars from database
    averagePaymentAmount: successfulPayments > 0 ? totalRevenue / successfulPayments : 0,
    failureRate: totalPayments > 0 ? failedPayments / totalPayments : 0,
    topFailureReasons,
  };
}

/**
 * Get recent failure rate (last 24 hours)
 */
async function getRecentFailureRate(): Promise<number> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const metrics = await getPaymentMetrics(yesterday, new Date());
  return metrics.failureRate;
}

/**
 * Health check for payment system
 */
export async function getPaymentSystemHealth() {
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [metrics24h, metrics7d] = await Promise.all([
    getPaymentMetrics(last24h, new Date()),
    getPaymentMetrics(last7d, new Date()),
  ]);

  // Check webhook health
  const recentWebhookFailures = await prisma.paymentTransaction.count({
    where: {
      createdAt: { gte: last24h },
      status: 'FAILED',
      description: { contains: 'webhook' },
    },
  });

  return {
    status: getHealthStatus(metrics24h.failureRate, recentWebhookFailures),
    last24Hours: metrics24h,
    last7Days: metrics7d,
    webhookHealth: {
      recentFailures: recentWebhookFailures,
      status: recentWebhookFailures === 0 ? 'HEALTHY' : 'DEGRADED',
    },
    recommendations: getHealthRecommendations(metrics24h, metrics7d, recentWebhookFailures),
  };
}

function getHealthStatus(failureRate: number, webhookFailures: number): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
  if (failureRate > 0.2 || webhookFailures > 5) return 'CRITICAL';
  if (failureRate > 0.1 || webhookFailures > 2) return 'WARNING';
  return 'HEALTHY';
}

function getHealthRecommendations(
  metrics24h: PaymentMetrics,
  metrics7d: PaymentMetrics,
  webhookFailures: number
): string[] {
  const recommendations: string[] = [];

  if (metrics24h.failureRate > 0.1) {
    recommendations.push('High failure rate detected. Review top failure reasons and contact affected customers.');
  }

  if (webhookFailures > 0) {
    recommendations.push('Webhook failures detected. Check endpoint configuration and server health.');
  }

  if (metrics24h.totalPayments === 0 && metrics7d.totalPayments > 0) {
    recommendations.push('No recent payments. Verify payment system is functioning correctly.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Payment system is operating normally.');
  }

  return recommendations;
}

// Helper functions
function getTransactionType(eventType: string): 'SETUP_FEE' | 'MONTHLY_SUBSCRIPTION' | 'REFUND' | 'MANUAL_PAYMENT' | 'MANUAL_SETUP_FEE' {
  switch (eventType) {
    case 'PAYMENT_ATTEMPT':
    case 'PAYMENT_SUCCESS':
    case 'PAYMENT_FAILED':
      return 'SETUP_FEE'; // Default, should be determined by context
    case 'SUBSCRIPTION_CREATED':
      return 'MONTHLY_SUBSCRIPTION';
    default:
      return 'SETUP_FEE';
  }
}

function getTransactionStatus(eventType: string): 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'REFUNDED' {
  switch (eventType) {
    case 'PAYMENT_ATTEMPT':
      return 'PENDING';
    case 'PAYMENT_SUCCESS':
      return 'SUCCEEDED';
    case 'PAYMENT_FAILED':
      return 'FAILED';
    case 'SUBSCRIPTION_CANCELLED':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}
