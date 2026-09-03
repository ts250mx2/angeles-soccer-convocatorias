-- Concede "Admon Deportiva > Equipos" a quienes ya administran la plantilla.
-- El permiso puede ajustarse despues, perfil por perfil, desde /perfiles.
--
-- Para revertir:
--   DELETE FROM tblPerfilPaginas WHERE Pagina = '/administracion-deportiva/equipos';

INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT IdPuesto, '/administracion-deportiva/equipos'
FROM tblPerfilPaginas
WHERE Pagina = '/administracion-deportiva/plantillas';
