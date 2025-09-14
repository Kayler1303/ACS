/*
  Warnings:

  - You are about to drop the column `createdAt` on the `RentRoll` table. All the data in the column will be lost.
  - You are about to drop the column `date` on the `RentRoll` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `RentRoll` table. All the data in the column will be lost.
  - You are about to drop the `Account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[leaseId]` on the table `Tenancy` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('LOGIN', 'LOGOUT', 'PAGE_VIEW', 'PROPERTY_VIEW', 'SNAPSHOT_UPLOAD', 'DOCUMENT_UPLOAD', 'USER_CREATED', 'PROPERTY_CREATED', 'ADMIN_ACTION', 'ACCOUNT_SUSPENDED', 'ACCOUNT_UNSUSPENDED');

-- CreateEnum
CREATE TYPE "SetupType" AS ENUM ('PENDING', 'FULL_SERVICE', 'SELF_SERVICE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('INACTIVE', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('SETUP_FEE', 'MONTHLY_SUBSCRIPTION', 'REFUND');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REFUNDED');

-- DropForeignKey
ALTER TABLE "Account" DROP CONSTRAINT "Account_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropIndex
DROP INDEX "RentRoll_propertyId_date_key";

-- AlterTable
ALTER TABLE "RentRoll" DROP COLUMN "createdAt",
DROP COLUMN "date",
DROP COLUMN "updatedAt",
ADD COLUMN     "filename" TEXT,
ADD COLUMN     "snapshotId" TEXT,
ADD COLUMN     "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Resident" ADD COLUMN     "originalRentRollIncome" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspended" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "Account";

-- DropTable
DROP TABLE "Session";

-- CreateTable
CREATE TABLE "PropertySubscription" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "setupType" "SetupType" NOT NULL DEFAULT 'PENDING',
    "setupFeeAmount" DECIMAL(10,2),
    "setupFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "setupFeeTransactionId" TEXT,
    "monthlyFeeAmount" DECIMAL(10,2),
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'INACTIVE',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertySubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "propertySubscriptionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "transactionType" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyAdminGrant" (
    "id" TEXT NOT NULL,
    "propertySubscriptionId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "reason" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PropertyAdminGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentRollSnapshot" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filename" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hudIncomeLimits" JSONB,
    "hudDataYear" INTEGER,

    CONSTRAINT "RentRollSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityType" "ActivityType" NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertySubscription_propertyId_key" ON "PropertySubscription"("propertyId");

-- CreateIndex
CREATE INDEX "PropertySubscription_propertyId_idx" ON "PropertySubscription"("propertyId");

-- CreateIndex
CREATE INDEX "PropertySubscription_subscriptionStatus_idx" ON "PropertySubscription"("subscriptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentTransaction_stripePaymentIntentId_key" ON "PaymentTransaction"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_propertySubscriptionId_idx" ON "PaymentTransaction"("propertySubscriptionId");

-- CreateIndex
CREATE INDEX "PaymentTransaction_status_idx" ON "PaymentTransaction"("status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_transactionType_idx" ON "PaymentTransaction"("transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyAdminGrant_propertySubscriptionId_key" ON "PropertyAdminGrant"("propertySubscriptionId");

-- CreateIndex
CREATE INDEX "PropertyAdminGrant_propertySubscriptionId_idx" ON "PropertyAdminGrant"("propertySubscriptionId");

-- CreateIndex
CREATE INDEX "PropertyAdminGrant_grantedById_idx" ON "PropertyAdminGrant"("grantedById");

-- CreateIndex
CREATE INDEX "PropertyAdminGrant_isActive_idx" ON "PropertyAdminGrant"("isActive");

-- CreateIndex
CREATE INDEX "RentRollSnapshot_propertyId_idx" ON "RentRollSnapshot"("propertyId");

-- CreateIndex
CREATE INDEX "RentRollSnapshot_uploadDate_idx" ON "RentRollSnapshot"("uploadDate");

-- CreateIndex
CREATE INDEX "UserActivity_userId_idx" ON "UserActivity"("userId");

-- CreateIndex
CREATE INDEX "UserActivity_activityType_idx" ON "UserActivity"("activityType");

-- CreateIndex
CREATE INDEX "UserActivity_createdAt_idx" ON "UserActivity"("createdAt");

-- CreateIndex
CREATE INDEX "RentRoll_propertyId_idx" ON "RentRoll"("propertyId");

-- CreateIndex
CREATE INDEX "RentRoll_snapshotId_idx" ON "RentRoll"("snapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenancy_leaseId_key" ON "Tenancy"("leaseId");

-- AddForeignKey
ALTER TABLE "RentRoll" ADD CONSTRAINT "RentRoll_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "RentRollSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertySubscription" ADD CONSTRAINT "PropertySubscription_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_propertySubscriptionId_fkey" FOREIGN KEY ("propertySubscriptionId") REFERENCES "PropertySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAdminGrant" ADD CONSTRAINT "PropertyAdminGrant_propertySubscriptionId_fkey" FOREIGN KEY ("propertySubscriptionId") REFERENCES "PropertySubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyAdminGrant" ADD CONSTRAINT "PropertyAdminGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RentRollSnapshot" ADD CONSTRAINT "RentRollSnapshot_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserActivity" ADD CONSTRAINT "UserActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
