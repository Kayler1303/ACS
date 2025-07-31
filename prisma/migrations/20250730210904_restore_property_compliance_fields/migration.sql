-- AlterTable
ALTER TABLE "public"."Property" ADD COLUMN     "complianceOption" TEXT DEFAULT '20% at 50% AMI, 55% at 80% AMI',
ADD COLUMN     "includeRentAnalysis" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "includeUtilityAllowances" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "utilityAllowances" JSONB;
