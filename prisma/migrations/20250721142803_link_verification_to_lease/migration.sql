/*
  Warnings:

  - You are about to drop the column `residentId` on the `IncomeVerification` table. All the data in the column will be lost.
  - Added the required column `residentId` to the `IncomeDocument` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenancyId` to the `IncomeVerification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `leaseEndDate` to the `Tenancy` table without a default value. This is not possible if the table is not empty.
  - Added the required column `leaseStartDate` to the `Tenancy` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "IncomeVerification" DROP CONSTRAINT "IncomeVerification_residentId_fkey";

-- DropIndex
DROP INDEX "IncomeVerification_residentId_idx";

-- AlterTable
ALTER TABLE "IncomeDocument" ADD COLUMN     "residentId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "IncomeVerification" DROP COLUMN "residentId",
ADD COLUMN     "tenancyId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN     "leaseEndDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "leaseStartDate" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "IncomeDocument_residentId_idx" ON "IncomeDocument"("residentId");

-- CreateIndex
CREATE INDEX "IncomeVerification_tenancyId_idx" ON "IncomeVerification"("tenancyId");

-- AddForeignKey
ALTER TABLE "IncomeVerification" ADD CONSTRAINT "IncomeVerification_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "Tenancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeDocument" ADD CONSTRAINT "IncomeDocument_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
