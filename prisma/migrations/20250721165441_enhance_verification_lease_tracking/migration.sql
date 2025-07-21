/*
  Warnings:

  - Added the required column `dueDate` to the `IncomeVerification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `verificationPeriodEnd` to the `IncomeVerification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `verificationPeriodStart` to the `IncomeVerification` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerificationReason" AS ENUM ('INITIAL_LEASE', 'ANNUAL_RECERTIFICATION', 'LEASE_RENEWAL', 'INCOME_CHANGE', 'COMPLIANCE_AUDIT');

-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'OVERDUE';

-- AlterTable - Add columns with temporary defaults for existing data
ALTER TABLE "IncomeVerification" ADD COLUMN     "associatedLeaseEnd" TIMESTAMP(3),
ADD COLUMN     "associatedLeaseStart" TIMESTAMP(3),
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "leaseYear" INTEGER,
ADD COLUMN     "reason" "VerificationReason" NOT NULL DEFAULT 'ANNUAL_RECERTIFICATION',
ADD COLUMN     "reminderSentAt" TIMESTAMP(3),
ADD COLUMN     "verificationPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "verificationPeriodStart" TIMESTAMP(3);

-- Update existing records with reasonable defaults based on their tenancy data
UPDATE "IncomeVerification" 
SET 
    "verificationPeriodStart" = (
        SELECT "leaseStartDate" 
        FROM "Tenancy" 
        WHERE "Tenancy"."id" = "IncomeVerification"."tenancyId"
    ),
    "verificationPeriodEnd" = (
        SELECT "leaseEndDate" 
        FROM "Tenancy" 
        WHERE "Tenancy"."id" = "IncomeVerification"."tenancyId"
    ),
    "dueDate" = (
        SELECT "leaseStartDate" + INTERVAL '30 days'
        FROM "Tenancy" 
        WHERE "Tenancy"."id" = "IncomeVerification"."tenancyId"
    ),
    "associatedLeaseStart" = (
        SELECT "leaseStartDate" 
        FROM "Tenancy" 
        WHERE "Tenancy"."id" = "IncomeVerification"."tenancyId"
    ),
    "associatedLeaseEnd" = (
        SELECT "leaseEndDate" 
        FROM "Tenancy" 
        WHERE "Tenancy"."id" = "IncomeVerification"."tenancyId"
    ),
    "leaseYear" = 1
WHERE "verificationPeriodStart" IS NULL;

-- Now make the required columns NOT NULL
ALTER TABLE "IncomeVerification" ALTER COLUMN "dueDate" SET NOT NULL;
ALTER TABLE "IncomeVerification" ALTER COLUMN "verificationPeriodEnd" SET NOT NULL;
ALTER TABLE "IncomeVerification" ALTER COLUMN "verificationPeriodStart" SET NOT NULL;

-- CreateIndex
CREATE INDEX "IncomeVerification_dueDate_idx" ON "IncomeVerification"("dueDate");

-- CreateIndex
CREATE INDEX "IncomeVerification_status_idx" ON "IncomeVerification"("status");
