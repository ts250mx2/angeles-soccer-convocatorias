-- Concede el modulo nuevo "Copas y Ligas > Incorporaciones" (/incorporaciones).
--
-- Los permisos se dan desde la pantalla de Perfiles, asi que esta migracion es un
-- ATAJO opcional: sin ella el modulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien administra el catalogo de copas y ligas, administra tambien
-- quien se incorpora a ellas": se concede a los perfiles que hoy tienen /copas-ligas.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/incorporaciones';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/incorporaciones'
FROM tblPerfilPaginas
WHERE Pagina = '/copas-ligas';
