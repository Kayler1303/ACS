-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "password" TEXT NOT NULL,
    "name" TEXT,
    "company" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "numberOfUnits" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "unitNumber" TEXT NOT NULL,
    "squareFootage" INTEGER,
    "leaseRent" DECIMAL(65,30),
    "bedroomCount" INTEGER,
    "amiPercentage" DECIMAL(65,30),
    "qualifiesIncome50" BOOLEAN,
    "qualifiesIncome60" BOOLEAN,
    "qualifiesIncome80" BOOLEAN,
    "qualifiesRentAndIncome50" BOOLEAN,
    "qualifiesRentAndIncome60" BOOLEAN,
    "qualifiesRentAndIncome80" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "propertyId" TEXT NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "annualizedIncome" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmiData" (
    "id" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "incomeLimit1Person100pct" DECIMAL(65,30) NOT NULL,
    "incomeLimit2Person100pct" DECIMAL(65,30) NOT NULL,
    "incomeLimit3Person100pct" DECIMAL(65,30) NOT NULL,
    "incomeLimit4Person100pct" DECIMAL(65,30) NOT NULL,
    "incomeLimit5Person100pct" DECIMAL(65,30) NOT NULL,
    "incomeLimit6Person100pct" DECIMAL(65,30) NOT NULL,
    "incomeLimit7Person100pct" DECIMAL(65,30) NOT NULL,
    "incomeLimit8Person100pct" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "AmiData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaxRentData" (
    "id" TEXT NOT NULL,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amiLevel" INTEGER NOT NULL,
    "maxRentStudio" DECIMAL(65,30) NOT NULL,
    "maxRent1Bedroom" DECIMAL(65,30) NOT NULL,
    "maxRent2Bedroom" DECIMAL(65,30) NOT NULL,
    "maxRent3Bedroom" DECIMAL(65,30) NOT NULL,
    "maxRent4Bedroom" DECIMAL(65,30) NOT NULL,
    "maxRent5Bedroom" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "MaxRentData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BedroomMapping" (
    "id" TEXT NOT NULL,
    "minSqFt" INTEGER NOT NULL,
    "maxSqFt" INTEGER NOT NULL,
    "bedroomCount" INTEGER NOT NULL,

    CONSTRAINT "BedroomMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_propertyId_unitNumber_key" ON "Unit"("propertyId", "unitNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_name_unitId_key" ON "Resident"("name", "unitId");

-- CreateIndex
CREATE UNIQUE INDEX "AmiData_county_state_year_key" ON "AmiData"("county", "state", "year");

-- CreateIndex
CREATE UNIQUE INDEX "MaxRentData_county_state_year_amiLevel_key" ON "MaxRentData"("county", "state", "year", "amiLevel");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
