-- AlterTable
ALTER TABLE "IncomeDocument" ADD COLUMN     "grossPayAmount" DOUBLE PRECISION,
ADD COLUMN     "payFrequency" TEXT,
ADD COLUMN     "payPeriodEndDate" TIMESTAMP(3),
ADD COLUMN     "payPeriodStartDate" TIMESTAMP(3);
