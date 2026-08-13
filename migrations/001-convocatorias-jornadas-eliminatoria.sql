-- Agrega a la convocatoria el número de jornadas y hasta qué eliminatoria llega.
--
-- Ambas admiten NULL a propósito: las 56 convocatorias que ya existían no traen el
-- dato y no se puede inventar. La pantalla las muestra como "—".
--
-- Eliminatoria se guarda como texto en vez de ENUM para no tener que alterar la
-- tabla cada vez que se agregue una fase. Los valores válidos viven en
-- src/lib/convocatoria-opciones.ts, que es lo que alimenta el selector.
--
-- Para revertir:
--   ALTER TABLE tblConvocatorias DROP COLUMN CantidadJornadas, DROP COLUMN Eliminatoria;

ALTER TABLE tblConvocatorias
    ADD COLUMN CantidadJornadas INT NULL AFTER CostoArbitro,
    ADD COLUMN Eliminatoria VARCHAR(20) NULL AFTER CantidadJornadas;
