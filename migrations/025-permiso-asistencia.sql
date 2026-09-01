-- Concede el modulo nuevo "Admon Deportiva > Asistencia"
-- (/administracion-deportiva/asistencia).
--
-- Atajo opcional, igual que la 015 y la 023: sin esto el modulo existe pero no lo ve
-- nadie hasta que un administrador lo marque perfil por perfil desde /perfiles.
--
-- El criterio es "quien ya ve la Plantilla de Equipos ve tambien la Asistencia": son
-- las dos hojas del mismo equipo y las usa la misma gente, el cuerpo tecnico.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/administracion-deportiva/asistencia';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/administracion-deportiva/asistencia'
FROM tblPerfilPaginas
WHERE Pagina = '/administracion-deportiva/plantillas';
