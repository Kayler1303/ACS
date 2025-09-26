-- CreateEnum
CREATE TYPE "LeaseType" AS ENUM ('CURRENT', 'FUTURE');

-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'SETUP_COMPLETE';

-- AlterTable
ALTER TABLE "Lease" ADD COLUMN     "leaseType" "LeaseType" NOT NULL DEFAULT 'CURRENT';

-- CreateIndex
CREATE INDEX "Lease_leaseType_idx" ON "Lease"("leaseType");
