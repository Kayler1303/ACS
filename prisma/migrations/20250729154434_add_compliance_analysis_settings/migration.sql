-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "includeRentAnalysis" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "includeUtilityAllowances" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "utilityAllowances" JSONB;
