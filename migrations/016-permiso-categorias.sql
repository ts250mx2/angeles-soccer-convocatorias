-- Concede el modulo nuevo "Jugadores > Categorias" (/jugadores/categorias).
--
-- Los permisos se dan desde la pantalla de Perfiles, asi que esta migracion es un
-- ATAJO opcional: sin ella el modulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien ya ve Inscripciones ve tambien las categorias": es la misma
-- plantilla y el mismo listado de alumnos, agrupado por grupo en lugar de por sede.
-- Cualquier otro reparto se hace desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/jugadores/categorias';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/jugadores/categorias'
FROM tblPerfilPaginas
WHERE Pagina = '/inscripciones';
