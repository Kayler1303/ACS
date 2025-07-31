/*
  Warnings:

  - You are about to drop the column `complianceOption` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `includeRentAnalysis` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `includeUtilityAllowances` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `utilityAllowances` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the `PropertyShare` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."PropertyShare" DROP CONSTRAINT "PropertyShare_propertyId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PropertyShare" DROP CONSTRAINT "PropertyShare_sharedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."PropertyShare" DROP CONSTRAINT "PropertyShare_userId_fkey";

-- AlterTable
ALTER TABLE "public"."IncomeDocument" ADD COLUMN     "calculatedAnnualizedIncome" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "public"."Property" DROP COLUMN "complianceOption",
DROP COLUMN "includeRentAnalysis",
DROP COLUMN "includeUtilityAllowances",
DROP COLUMN "utilityAllowances";

-- AlterTable
ALTER TABLE "public"."Resident" ADD COLUMN     "calculatedAnnualizedIncome" DECIMAL(10,2),
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "hasNoIncome" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "incomeFinalized" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "public"."PropertyShare";

-- DropEnum
DROP TYPE "public"."PermissionLevel";
