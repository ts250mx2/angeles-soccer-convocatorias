-- Concede el módulo nuevo "Jugadores › Lista de Jugadores" (/jugadores).
--
-- Los permisos se dan desde la pantalla de Perfiles, así que esta migración es un
-- ATAJO opcional: sin ella, el módulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien ya ve Inscripciones ve también la lista de jugadores": ambas
-- pantallas muestran la misma plantilla, solo que esta la presenta jugador por jugador.
-- Cualquier otro reparto se hace desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/jugadores';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/jugadores'
FROM tblPerfilPaginas
WHERE Pagina = '/inscripciones';
