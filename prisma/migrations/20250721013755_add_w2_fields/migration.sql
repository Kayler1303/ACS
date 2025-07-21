-- AlterTable
ALTER TABLE "IncomeDocument" ADD COLUMN     "box1_wages" DOUBLE PRECISION,
ADD COLUMN     "box3_ss_wages" DOUBLE PRECISION,
ADD COLUMN     "box5_med_wages" DOUBLE PRECISION,
ADD COLUMN     "employeeName" TEXT,
ADD COLUMN     "employerName" TEXT,
ADD COLUMN     "taxYear" INTEGER;
