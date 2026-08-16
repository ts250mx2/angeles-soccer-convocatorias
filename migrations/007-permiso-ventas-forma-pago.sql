-- Concede el módulo nuevo "Ventas › Ventas por Forma de Pago" (/ventas/por-forma-pago).
--
-- Los permisos se dan desde la pantalla de Perfiles, así que esta migración es un
-- ATAJO opcional: sin ella, el módulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien ya ve un reporte de ventas, ve también este": se concede a
-- los perfiles que hoy tienen /ventas/por-producto. Cualquier otro reparto se hace
-- desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/ventas/por-forma-pago';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/ventas/por-forma-pago'
FROM tblPerfilPaginas
WHERE Pagina = '/ventas/por-producto';
