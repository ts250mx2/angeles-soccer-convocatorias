-- Concede el módulo nuevo "Jugadores › Preregistros" (/preregistros).
--
-- Los permisos se dan desde la pantalla de Perfiles, así que esta migración es un
-- ATAJO opcional: sin ella, el módulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien ya ve el QR de preregistro, ve también lo que cae por él":
-- se concede a los perfiles que hoy tienen /qr-accesos. Cualquier otro reparto se hace
-- desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/preregistros';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/preregistros'
FROM tblPerfilPaginas
WHERE Pagina = '/qr-accesos';
