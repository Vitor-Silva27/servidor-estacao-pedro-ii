-- CreateEnum
CREATE TYPE "EstablishmentType" AS ENUM ('HOSPEDAGEM', 'RESTAURANTE');

-- CreateEnum
CREATE TYPE "PriceRange" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateTable
CREATE TABLE "Establishment" (
    "id" TEXT NOT NULL,
    "type" "EstablishmentType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "address" TEXT NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "instagram" TEXT,
    "openingHours" TEXT,
    "priceRange" "PriceRange" NOT NULL,
    "highlights" TEXT,
    "coverPhotoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstablishmentPhoto" (
    "id" TEXT NOT NULL,
    "establishmentId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstablishmentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Establishment_coverPhotoId_key" ON "Establishment"("coverPhotoId");

-- AddForeignKey
ALTER TABLE "Establishment" ADD CONSTRAINT "Establishment_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "EstablishmentPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstablishmentPhoto" ADD CONSTRAINT "EstablishmentPhoto_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
