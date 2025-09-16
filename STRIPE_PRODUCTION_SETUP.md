# 🚀 Stripe Production Setup Guide

## Step 1: Stripe Dashboard Setup

### 1.1 Activate Your Live Account
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Complete business verification (if not done)
3. Add your bank account details
4. Switch to "Live" mode (toggle in top-left)

### 1.2 Get Your Live API Keys
```bash
# In Stripe Dashboard > Developers > API keys (Live mode)
STRIPE_SECRET_KEY=sk_live_...           # Secret key (server-side)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...  # Publishable key (client-side)
```

### 1.3 Set Up Webhooks (Live Mode)
1. Go to Developers > Webhooks
2. Create endpoint: `https://apartmentcompliance.com/api/webhooks/stripe`
3. Select these events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Copy the webhook signing secret: `whsec_...`

## Step 2: Environment Variables

### 2.1 Update Vercel Environment Variables
```bash
# Production Stripe Keys
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Make sure these are set to "Production" environment in Vercel
```

### 2.2 Test Environment Variables
```bash
# Keep separate test keys for development
STRIPE_SECRET_KEY_TEST=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...
```

## Step 3: Pre-Production Checklist

### 3.1 Code Review
- [ ] All test mode hardcoded values removed
- [ ] Error handling in place for payment failures
- [ ] Webhook signature verification working
- [ ] Proper logging for all payment events

### 3.2 Testing Plan
- [ ] Process a $1 test payment in live mode
- [ ] Verify webhook delivery
- [ ] Test failed payment scenarios
- [ ] Confirm subscription creation works
- [ ] Test refund process (if applicable)

### 3.3 Monitoring Setup
- [ ] Payment failure alerts configured
- [ ] Webhook failure monitoring
- [ ] Revenue tracking dashboard
- [ ] Error logging and notifications

## Step 4: Go-Live Process

### 4.1 Deployment
1. Update environment variables in Vercel
2. Deploy to production
3. Test with small payment first
4. Monitor for 24 hours before full launch

### 4.2 Post-Launch Monitoring
- [ ] Daily payment reconciliation
- [ ] Weekly revenue reports
- [ ] Monthly failed payment analysis
- [ ] Quarterly subscription health check

## Step 5: Ongoing Maintenance

### 5.1 Regular Tasks
- Monitor failed payments weekly
- Update payment methods for expired cards
- Review subscription metrics monthly
- Update webhook endpoints as needed

### 5.2 Compliance
- PCI compliance maintained (handled by Stripe)
- GDPR compliance for customer data
- Financial record keeping
- Tax reporting preparation

## Emergency Contacts

- Stripe Support: https://support.stripe.com
- Your account manager: [Add when assigned]
- Internal dev team: [Add contacts]

## Important Notes

⚠️ **Never commit live API keys to git**
⚠️ **Always test in live mode with small amounts first**
⚠️ **Monitor webhook delivery closely in first week**
⚠️ **Have rollback plan ready**

---

Last updated: January 2025
