-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "calculatedAnnualizedIncome" DECIMAL(10,2),
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "incomeFinalized" BOOLEAN NOT NULL DEFAULT false;
