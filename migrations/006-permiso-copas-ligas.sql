-- Concede el módulo nuevo "Copas y Ligas › Catálogo de Copas y Ligas" (/copas-ligas).
--
-- Los permisos se dan desde la pantalla de Perfiles, así que esta migración es un
-- ATAJO opcional: sin ella, el módulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien ya cobra copas y ligas puede mantener su catálogo": se concede
-- a los perfiles que hoy tienen /pagos-copas. El catálogo cambia PRECIOS, así que no
-- conviene repartirlo más ancho que eso; cualquier otro reparto se hace desde /perfiles.
--
-- La columna tblLigas.Foto (longtext) que guarda la imagen ya existe en la base.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/copas-ligas';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/copas-ligas'
FROM tblPerfilPaginas
WHERE Pagina = '/pagos-copas';
