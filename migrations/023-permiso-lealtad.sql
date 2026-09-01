-- Concede el modulo nuevo "Jugadores > Lealtad" (/jugadores/lealtad).
--
-- Los permisos se dan desde la pantalla de Perfiles, asi que esta migracion es un
-- ATAJO opcional: sin ella el modulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil. Es la misma forma que la 015 uso para
-- Becas.
--
-- El criterio es "quien ya ve la Lista de Jugadores ve tambien el reporte de lealtad":
-- lo que muestra son los mismos jugadores con sus mismos pagos de inscripcion, que ya
-- se ven en la Lista y en Inscripciones. No expone un dato nuevo, solo lo cuenta.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/jugadores/lealtad';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/jugadores/lealtad'
FROM tblPerfilPaginas
WHERE Pagina = '/jugadores';
