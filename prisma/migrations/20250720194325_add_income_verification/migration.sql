-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('W2', 'PAYSTUB', 'OFFER_LETTER', 'BANK_STATEMENT', 'SOCIAL_SECURITY_LETTER', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'COMPLETED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "verifiedIncome" DECIMAL(65,30);

-- CreateTable
CREATE TABLE "IncomeDocument" (
    "id" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "filePath" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,

    CONSTRAINT "IncomeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomeDocument_residentId_idx" ON "IncomeDocument"("residentId");

-- AddForeignKey
ALTER TABLE "IncomeDocument" ADD CONSTRAINT "IncomeDocument_residentId_fkey" FOREIGN KEY ("residentId") REFERENCES "Resident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
