-- Concede los modulos nuevos que salen de partir en dos las dos pantallas de torneos:
--
--   Pagos de Copas      /pagos-copas/copas
--   Pagos de Ligas      /pagos-copas/ligas
--   Catalogo de Copas   /copas-ligas/copas
--   Catalogo de Ligas   /copas-ligas/ligas
--
-- Cada mitad es una clave propia, a proposito: asi se le puede dar a alguien solo las
-- copas. La pantalla completa sigue existiendo como modulo (ya no se pinta en el menu)
-- porque es la duena de la ruta y de su API.
--
-- El criterio es "quien veia la pantalla completa ve sus dos mitades". Cualquier otro
-- reparto se hace desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas
--    WHERE Pagina IN ('/pagos-copas/copas', '/pagos-copas/ligas',
--                     '/copas-ligas/copas', '/copas-ligas/ligas');

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/pagos-copas/copas' FROM tblPerfilPaginas WHERE Pagina = '/pagos-copas';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/pagos-copas/ligas' FROM tblPerfilPaginas WHERE Pagina = '/pagos-copas';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/copas-ligas/copas' FROM tblPerfilPaginas WHERE Pagina = '/copas-ligas';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/copas-ligas/ligas' FROM tblPerfilPaginas WHERE Pagina = '/copas-ligas';
