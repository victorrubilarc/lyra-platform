-- Datos personales opcionales de Person (profesionalizacion del catalogo, tipo SAP HR IT0002 /
-- Maximo Person): tipo de documento (contempla EXTRANJEROS, no solo RUT), fecha de nacimiento
-- (edad derivada), sexo/genero y nacionalidad. Todo NULLABLE (retrocompatible).

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "nationalIdType" TEXT,
ADD COLUMN     "nationality" TEXT;
