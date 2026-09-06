-- CreateEnum
CREATE TYPE "AttractionType" AS ENUM ('CACHOEIRA', 'PONTO_TURISTICO');

-- CreateEnum
CREATE TYPE "TrailLevel" AS ENUM ('FACIL', 'MEDIA', 'DIFICIL');

-- CreateTable
CREATE TABLE "Attraction" (
    "id" TEXT NOT NULL,
    "type" "AttractionType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "tips" TEXT,
    "howToGet" TEXT,
    "trailDistance" TEXT,
    "trailTime" TEXT,
    "trailLevel" "TrailLevel",
    "openingHours" TEXT,
    "price" TEXT,
    "coverPhotoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttractionPhoto" (
    "id" TEXT NOT NULL,
    "attractionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttractionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Attraction_coverPhotoId_key" ON "Attraction"("coverPhotoId");

-- AddForeignKey
ALTER TABLE "Attraction" ADD CONSTRAINT "Attraction_coverPhotoId_fkey" FOREIGN KEY ("coverPhotoId") REFERENCES "AttractionPhoto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttractionPhoto" ADD CONSTRAINT "AttractionPhoto_attractionId_fkey" FOREIGN KEY ("attractionId") REFERENCES "Attraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
