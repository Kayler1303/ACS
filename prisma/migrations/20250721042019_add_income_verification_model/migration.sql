/*
  Warnings:

  - You are about to drop the column `residentId` on the `IncomeDocument` table. All the data in the column will be lost.
  - You are about to alter the column `verifiedIncome` on the `Resident` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - Added the required column `verificationId` to the `IncomeDocument` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('IN_PROGRESS', 'FINALIZED');

-- DropForeignKey
ALTER TABLE "IncomeDocument" DROP CONSTRAINT "IncomeDocument_residentId_fkey";

-- DropIndex
DROP INDEX "IncomeDocument_residentId_idx";

-- AlterTable
ALTER TABLE "IncomeDocument" DROP COLUMN "residentId",
ADD COLUMN     "verificationId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Resident" ALTER COLUMN "annualizedIncome" SET DATA TYPE TEXT,
ALTER COLUMN "verifiedIncome" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "IncomeVerification" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "calculatedVerifiedIncome" DOUBLE PRECISION,

    CONSTRAINT "IncomeVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeVerification_residentId_idx" ON "IncomeVerification"("residentId");

-- CreateIndex
CREATE INDEX "IncomeDocument_verificationId_idx" ON "IncomeDocument"("verificationId");

-- CreateIndex
CREATE INDEX "Resident_tenancyId_idx" ON "Resident"("tenancyId");

-- AddForeignKey
ALTER TABLE "IncomeVerification" ADD CONSTRAINT "IncomeVerification_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeDocument" ADD CONSTRAINT "IncomeDocument_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "IncomeVerification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
