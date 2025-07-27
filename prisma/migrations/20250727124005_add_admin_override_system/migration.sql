-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "OverrideRequestType" AS ENUM ('VALIDATION_EXCEPTION', 'INCOME_DISCREPANCY', 'DOCUMENT_REVIEW');

-- CreateEnum
CREATE TYPE "OverrideRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'APPLIED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "OverrideRequest" (
    "id" TEXT NOT NULL,
    "type" "OverrideRequestType" NOT NULL,
    "status" "OverrideRequestStatus" NOT NULL DEFAULT 'PENDING',
    "userExplanation" TEXT NOT NULL,
    "adminNotes" TEXT,
    "unitId" TEXT,
    "residentId" TEXT,
    "verificationId" TEXT,
    "documentId" TEXT,
    "requesterId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "OverrideRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OverrideRequest_status_idx" ON "OverrideRequest"("status");

-- CreateIndex
CREATE INDEX "OverrideRequest_type_idx" ON "OverrideRequest"("type");

-- CreateIndex
CREATE INDEX "OverrideRequest_requesterId_idx" ON "OverrideRequest"("requesterId");

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OverrideRequest" ADD CONSTRAINT "OverrideRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
