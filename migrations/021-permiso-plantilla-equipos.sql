-- Concede el modulo nuevo "Administracion Deportiva > Plantilla de Equipos".
--
-- Los permisos se dan desde la pantalla de Perfiles, asi que esta migracion es un
-- ATAJO opcional: sin ella el modulo existe pero no lo ve nadie hasta que un
-- administrador lo marque perfil por perfil.
--
-- El criterio es "quien ya ve Categorias ve tambien la Plantilla": las dos pantallas
-- trabajan sobre los grupos de entrenamiento y su gente, y la Plantilla no expone
-- ningun dato que Categorias no muestre ya (nombre, fecha de nacimiento y beca del
-- jugador). Se elige Categorias y no la Lista de Jugadores porque la Lista la ve mas
-- gente, incluida la parte administrativa que no arma alineaciones.
--
-- Cualquier otro reparto se hace desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/administracion-deportiva/plantillas';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/administracion-deportiva/plantillas'
FROM tblPerfilPaginas
WHERE Pagina = '/jugadores/categorias';
