-- AddColumn saturdayPoolAStart and saturdayPoolBStart
ALTER TABLE "Tournament" ADD COLUMN "saturdayPoolAStart" TIMESTAMP(3);
ALTER TABLE "Tournament" ADD COLUMN "saturdayPoolBStart" TIMESTAMP(3);
