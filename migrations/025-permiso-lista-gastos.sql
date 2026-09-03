-- Concede el modulo nuevo "Gastos > Lista de Gastos" (/gastos/lista).
--
-- Los permisos se dan desde la pantalla de Perfiles, asi que esta migracion es un ATAJO
-- opcional: sin ella el modulo existe pero no lo ve nadie hasta que un administrador lo
-- marque perfil por perfil.
--
-- El criterio es "quien ya ve Gastos por Sede ve tambien la lista": son el MISMO dinero
-- —los renglones de tblEgresos del periodo— presentados de dos maneras. La lista no
-- expone nada que el detalle de una sede no ensene ya; lo que hace es no obligar a entrar
-- sede por sede para verlos todos juntos.
--
-- OJO: la ruta de Gastos por Sede sigue siendo '/gastos/egresos' aunque el menu ahora
-- diga "Gastos por Sede". La ruta es la clave del permiso, y renombrarla obligaria a
-- volver a concederselo a cada perfil; el rotulo es solo lo que se lee.
--
-- Cualquier otro reparto se hace desde /perfiles, no editando este archivo.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/gastos/lista';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/gastos/lista'
FROM tblPerfilPaginas
WHERE Pagina = '/gastos/egresos';
