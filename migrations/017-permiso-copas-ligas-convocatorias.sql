-- Concede los modulos nuevos "Copas y Ligas > Copas" y "> Ligas", que son la pantalla
-- de Convocatorias acotada a un tipo de torneo.
--
-- Los permisos se dan desde la pantalla de Perfiles, asi que esta migracion es un
-- ATAJO opcional: sin ella los modulos existen pero no los ve nadie hasta que un
-- administrador los marque perfil por perfil.
--
-- El criterio es "quien ve Convocatorias ve las dos mitades": son la misma pantalla y
-- los mismos datos, partidos por tipo. Se separan en dos claves a proposito, para que
-- se le pueda dar a alguien solo las copas o solo las ligas sin darle la portada
-- completa. Cualquier otro reparto se hace desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina IN ('/convocatorias/copas', '/convocatorias/ligas');

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/convocatorias/copas'
FROM tblPerfilPaginas
WHERE Pagina = '/';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/convocatorias/ligas'
FROM tblPerfilPaginas
WHERE Pagina = '/';
