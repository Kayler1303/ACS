/*
  Warnings:

  - Changed the type of `annualizedIncome` on the `Resident` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "Resident" DROP COLUMN "annualizedIncome",
ADD COLUMN     "annualizedIncome" DOUBLE PRECISION NOT NULL;
