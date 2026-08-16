-- Concede los módulos nuevos "Gastos › Gastos por Forma de Pago" (/gastos/por-forma-pago)
-- y "Gastos › Gastos por Tipo" (/gastos/por-tipo).
--
-- Los permisos se dan desde la pantalla de Perfiles, así que esta migración es un
-- ATAJO opcional: sin ella, los módulos existen pero no los ve nadie hasta que un
-- administrador los marque perfil por perfil.
--
-- El criterio es "quien ya ve los gastos, ve también estos reportes": se conceden a
-- los perfiles que hoy tienen /gastos/egresos. Cualquier otro reparto se hace desde
-- /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina IN ('/gastos/por-forma-pago', '/gastos/por-tipo');

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/gastos/por-forma-pago'
FROM tblPerfilPaginas
WHERE Pagina = '/gastos/egresos';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/gastos/por-tipo'
FROM tblPerfilPaginas
WHERE Pagina = '/gastos/egresos';
