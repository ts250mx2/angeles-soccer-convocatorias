-- Borra las convocatorias de clinics.
--
-- Clinics no juega liga ni copa, así que estas convocatorias nunca se van a usar. Se
-- identifican por dos señales, cualquiera de las dos basta:
--   * la categoría dice CLINICS (2016CLINICS, 2018CLINICS FS, ...)
--   * la liga se llama CLINICS
-- La segunda es la que atrapa a las que traen una categoría normal colgada de la liga
-- de clinics.
--
-- El detalle se borra primero porque es el que cuelga de la convocatoria; si se borrara
-- al revés quedarían renglones huérfanos, invisibles y sumando en los totales.
--
-- Idempotente: correrlo dos veces no hace nada la segunda.

DELETE D
FROM tblDetalleConvocatorias D
INNER JOIN tblConvocatorias C
        ON C.IdTemporada = D.IdTemporada
       AND C.IdLiga      = D.IdLiga
       AND C.Categoria   = D.Categoria
       AND C.Color       = D.Color
LEFT JOIN tblLigas L ON L.IdLiga = C.IdLiga
WHERE UPPER(C.Categoria) LIKE '%CLINIC%'
   OR UPPER(L.Liga)      LIKE '%CLINIC%';

DELETE C
FROM tblConvocatorias C
LEFT JOIN tblLigas L ON L.IdLiga = C.IdLiga
WHERE UPPER(C.Categoria) LIKE '%CLINIC%'
   OR UPPER(L.Liga)      LIKE '%CLINIC%';

-- Detalle huérfano de clinics: renglones cuya convocatoria ya no existe (borrada antes,
-- a mano o por una corrida previa de esto). Sin esto se quedan para siempre.
DELETE D
FROM tblDetalleConvocatorias D
LEFT JOIN tblConvocatorias C
       ON C.IdTemporada = D.IdTemporada
      AND C.IdLiga      = D.IdLiga
      AND C.Categoria   = D.Categoria
      AND C.Color       = D.Color
LEFT JOIN tblLigas L ON L.IdLiga = D.IdLiga
WHERE C.IdTemporada IS NULL
  AND (UPPER(D.Categoria) LIKE '%CLINIC%' OR UPPER(L.Liga) LIKE '%CLINIC%');
