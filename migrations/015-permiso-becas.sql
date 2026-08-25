-- Concede el modulo nuevo "Jugadores > Becas" (/jugadores/becas).
--
-- Los permisos se dan desde la pantalla de Perfiles, asi que esta migracion es un
-- ATAJO opcional: sin ella el modulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien ya ve la Lista de Jugadores ve tambien el reporte de becas":
-- la Lista ya muestra y exporta el porcentaje de beca de cada jugador, asi que este
-- reporte no expone un dato nuevo, solo lo presenta junto y con el tipo de beca.
-- Cualquier otro reparto se hace desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/jugadores/becas';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/jugadores/becas'
FROM tblPerfilPaginas
WHERE Pagina = '/jugadores';
