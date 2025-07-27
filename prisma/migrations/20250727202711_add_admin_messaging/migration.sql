/*
  Warnings:

  - You are about to alter the column `box1_wages` on the `IncomeDocument` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `box3_ss_wages` on the `IncomeDocument` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `box5_med_wages` on the `IncomeDocument` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `calculatedAnnualizedIncome` on the `IncomeDocument` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `grossPayAmount` on the `IncomeDocument` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `calculatedVerifiedIncome` on the `IncomeVerification` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to drop the column `appliedAt` on the `OverrideRequest` table. All the data in the column will be lost.
  - You are about to alter the column `verifiedIncome` on the `Resident` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - You are about to alter the column `annualizedIncome` on the `Resident` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Decimal(10,2)`.
  - Added the required column `updatedAt` to the `OverrideRequest` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "IncomeDocument" DROP CONSTRAINT "IncomeDocument_residentId_fkey";

-- DropForeignKey
ALTER TABLE "IncomeDocument" DROP CONSTRAINT "IncomeDocument_verificationId_fkey";

-- DropForeignKey
ALTER TABLE "IncomeVerification" DROP CONSTRAINT "IncomeVerification_leaseId_fkey";

-- DropForeignKey
ALTER TABLE "Resident" DROP CONSTRAINT "Resident_leaseId_fkey";

-- DropForeignKey
ALTER TABLE "Unit" DROP CONSTRAINT "Unit_propertyId_fkey";

-- DropIndex
DROP INDEX "IncomeVerification_dueDate_idx";

-- DropIndex
DROP INDEX "OverrideRequest_requesterId_idx";

-- DropIndex
DROP INDEX "OverrideRequest_status_idx";

-- DropIndex
DROP INDEX "OverrideRequest_type_idx";

-- DropIndex
DROP INDEX "Unit_propertyId_unitNumber_key";

-- AlterTable
ALTER TABLE "IncomeDocument" ALTER COLUMN "status" SET DEFAULT 'PROCESSING',
ALTER COLUMN "box1_wages" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "box3_ss_wages" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "box5_med_wages" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "calculatedAnnualizedIncome" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "grossPayAmount" SET DATA TYPE DECIMAL(10,2);

-- AlterTable
ALTER TABLE "IncomeVerification" ALTER COLUMN "calculatedVerifiedIncome" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "dueDate" DROP NOT NULL,
ALTER COLUMN "reason" DROP NOT NULL,
ALTER COLUMN "reason" DROP DEFAULT,
ALTER COLUMN "verificationPeriodEnd" DROP NOT NULL,
ALTER COLUMN "verificationPeriodStart" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OverrideRequest" DROP COLUMN "appliedAt",
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "userExplanation" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Resident" ALTER COLUMN "verifiedIncome" SET DATA TYPE DECIMAL(10,2),
ALTER COLUMN "annualizedIncome" DROP NOT NULL,
ALTER COLUMN "annualizedIncome" SET DATA TYPE DECIMAL(10,2);

-- CreateTable
CREATE TABLE "AdminMessage" (
    "id" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overrideRequestId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,

    CONSTRAINT "AdminMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeDocument_status_idx" ON "IncomeDocument"("status");

-- CreateIndex
CREATE INDEX "Unit_propertyId_idx" ON "Unit"("propertyId");

-- CreateIndex
CREATE INDEX "Unit_unitNumber_idx" ON "Unit"("unitNumber");

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeVerification" ADD CONSTRAINT "IncomeVerification_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeDocument" ADD CONSTRAINT "IncomeDocument_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "IncomeVerification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeDocument" ADD CONSTRAINT "IncomeDocument_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "IncomeVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IncomeDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMessage" ADD CONSTRAINT "AdminMessage_overrideRequestId_fkey" FOREIGN KEY ("overrideRequestId") REFERENCES "OverrideRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMessage" ADD CONSTRAINT "AdminMessage_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminMessage" ADD CONSTRAINT "AdminMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
