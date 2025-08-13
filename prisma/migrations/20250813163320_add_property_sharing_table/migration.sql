-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('READ_ONLY', 'CONFIGURE', 'EDIT');

-- AlterEnum
ALTER TYPE "OverrideRequestType" ADD VALUE 'DUPLICATE_DOCUMENT';

-- CreateTable
CREATE TABLE "PropertyShare" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "permission" "PermissionLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertyShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyShare_propertyId_userId_key" ON "PropertyShare"("propertyId", "userId");

-- AddForeignKey
ALTER TABLE "PropertyShare" ADD CONSTRAINT "PropertyShare_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyShare" ADD CONSTRAINT "PropertyShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyShare" ADD CONSTRAINT "PropertyShare_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
