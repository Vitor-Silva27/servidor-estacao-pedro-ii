-- CreateTable
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "whatsapp" TEXT NOT NULL,
    "instagram" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_AttractionToGuide" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_AttractionToGuide_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_AttractionToGuide_B_index" ON "_AttractionToGuide"("B");

-- AddForeignKey
ALTER TABLE "_AttractionToGuide" ADD CONSTRAINT "_AttractionToGuide_A_fkey" FOREIGN KEY ("A") REFERENCES "Attraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AttractionToGuide" ADD CONSTRAINT "_AttractionToGuide_B_fkey" FOREIGN KEY ("B") REFERENCES "Guide"("id") ON DELETE CASCADE ON UPDATE CASCADE;
