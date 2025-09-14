-- CreateEnum
CREATE TYPE "ManualPaymentMethod" AS ENUM ('ACH', 'CHECK', 'WIRE_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "ManualPaymentType" AS ENUM ('SETUP_FEE', 'MONTHLY_PAYMENT', 'PARTIAL_PAYMENT', 'LATE_FEE', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'MANUAL_PAYMENT';
ALTER TYPE "TransactionType" ADD VALUE 'MANUAL_SETUP_FEE';

-- AlterTable
ALTER TABLE "PropertySubscription" ADD COLUMN     "isManualPayment" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualPaymentNotes" TEXT,
ADD COLUMN     "nextPaymentDue" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ManualPayment" (
    "id" TEXT NOT NULL,
    "propertySubscriptionId" TEXT NOT NULL,
    "paymentMethod" "ManualPaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentType" "ManualPaymentType" NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "paidDate" TIMESTAMP(3) NOT NULL,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),

    CONSTRAINT "ManualPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualPayment_propertySubscriptionId_idx" ON "ManualPayment"("propertySubscriptionId");

-- CreateIndex
CREATE INDEX "ManualPayment_recordedById_idx" ON "ManualPayment"("recordedById");

-- CreateIndex
CREATE INDEX "ManualPayment_paidDate_idx" ON "ManualPayment"("paidDate");

-- CreateIndex
CREATE INDEX "PropertySubscription_isManualPayment_idx" ON "PropertySubscription"("isManualPayment");

-- AddForeignKey
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_propertySubscriptionId_fkey" FOREIGN KEY ("propertySubscriptionId") REFERENCES "PropertySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualPayment" ADD CONSTRAINT "ManualPayment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
