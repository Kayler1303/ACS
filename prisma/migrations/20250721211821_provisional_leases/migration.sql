-- CreateTable
CREATE TABLE "Lease" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaseStartDate" TIMESTAMP(3) NOT NULL,
    "leaseEndDate" TIMESTAMP(3) NOT NULL,
    "leaseRent" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "Lease_pkey" PRIMARY KEY ("id")
);

-- Step 1: Create a lease for each existing tenancy
INSERT INTO "Lease" ("id", "name", "leaseStartDate", "leaseEndDate", "leaseRent", "createdAt", "updatedAt", "unitId")
SELECT
    "id",
    'Lease from ' || to_char("leaseStartDate", 'YYYY-MM-DD') || ' to ' || to_char("leaseEndDate", 'YYYY-MM-DD'),
    "leaseStartDate",
    "leaseEndDate",
    "leaseRent",
    "createdAt",
    "updatedAt",
    "unitId"
FROM "Tenancy";

-- DropForeignKey
ALTER TABLE "IncomeVerification" DROP CONSTRAINT "IncomeVerification_tenancyId_fkey";

-- DropForeignKey
ALTER TABLE "Resident" DROP CONSTRAINT "Resident_tenancyId_fkey";

-- DropForeignKey
ALTER TABLE "Tenancy" DROP CONSTRAINT "Tenancy_unitId_fkey";

-- DropIndex
DROP INDEX "IncomeVerification_tenancyId_idx";

-- DropIndex
DROP INDEX "Resident_tenancyId_idx";

-- DropIndex
DROP INDEX "Tenancy_unitId_rentRollId_key";

-- AlterTable
ALTER TABLE "IncomeVerification" ADD COLUMN "leaseId" TEXT;
UPDATE "IncomeVerification" SET "leaseId" = "tenancyId";
ALTER TABLE "IncomeVerification" ALTER COLUMN "leaseId" SET NOT NULL;
ALTER TABLE "IncomeVerification" DROP COLUMN "tenancyId";


-- AlterTable
ALTER TABLE "Resident" ADD COLUMN "leaseId" TEXT;
UPDATE "Resident" SET "leaseId" = "tenancyId";
ALTER TABLE "Resident" ALTER COLUMN "leaseId" SET NOT NULL;
ALTER TABLE "Resident" DROP COLUMN "tenancyId";


-- AlterTable
ALTER TABLE "Tenancy" ADD COLUMN "leaseId" TEXT;
UPDATE "Tenancy" SET "leaseId" = "id";
ALTER TABLE "Tenancy" ALTER COLUMN "leaseId" SET NOT NULL;
ALTER TABLE "Tenancy" DROP COLUMN "leaseEndDate",
DROP COLUMN "leaseRent",
DROP COLUMN "leaseStartDate",
DROP COLUMN "unitId";


-- CreateIndex
CREATE INDEX "Lease_unitId_idx" ON "Lease"("unitId");

-- CreateIndex
CREATE INDEX "IncomeVerification_leaseId_idx" ON "IncomeVerification"("leaseId");

-- CreateIndex
CREATE INDEX "Resident_leaseId_idx" ON "Resident"("leaseId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenancy_leaseId_key" ON "Tenancy"("leaseId");

-- CreateIndex
CREATE INDEX "Tenancy_rentRollId_idx" ON "Tenancy"("rentRollId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenancy_leaseId_rentRollId_key" ON "Tenancy"("leaseId", "rentRollId");

-- AddForeignKey
ALTER TABLE "Lease" ADD CONSTRAINT "Lease_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tenancy" ADD CONSTRAINT "Tenancy_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeVerification" ADD CONSTRAINT "IncomeVerification_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "Lease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
