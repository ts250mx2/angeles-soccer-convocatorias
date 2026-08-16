-- Permisos de módulo por perfil (puesto).
--
-- Hasta ahora el acceso se decidía con UNA sola columna, tblPuestos.M8: si valía 2 el
-- usuario veía todo, si no veía Convocatorias, Inscripciones y el Manual. Esta tabla
-- lo sustituye por una lista explícita de módulos por perfil, editable desde
-- /perfiles, sin tocar las columnas M1..M20 (las sigue usando el sistema de escritorio
-- y su significado no es el mismo que el de esta aplicación).
--
-- La clave del módulo es su ruta en la aplicación (la MISMA que usa el menú y el
-- manual). El catálogo de rutas válidas vive en src/lib/navegacion.ts; el servidor
-- rechaza cualquier clave que no esté ahí.
--
-- InnoDB a propósito, aunque el resto del esquema sea MyISAM: guardar los permisos de
-- un perfil es un borra-y-vuelve-a-insertar, y aquí sí hay transacción que lo proteja.
--
-- Para revertir:
--   DROP TABLE tblPerfilPaginas;

CREATE TABLE IF NOT EXISTS tblPerfilPaginas (
    IdPuesto INT         NOT NULL,
    Pagina   VARCHAR(120) NOT NULL,
    PRIMARY KEY (IdPuesto, Pagina)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Siembra: reproduce EXACTAMENTE lo que cada perfil veía con la regla anterior, para
-- que el día del despliegue nadie gane ni pierda accesos. A partir de ahí se ajusta
-- desde la pantalla de Perfiles.
--
-- Es una foto del catálogo al momento de la migración: si después se agregan módulos,
-- se conceden desde la pantalla, no editando este archivo.
INSERT IGNORE INTO tblPerfilPaginas (IdPuesto, Pagina)
SELECT P.IdPuesto, M.Pagina
FROM tblPuestos P
CROSS JOIN (
              SELECT '/'                      AS Pagina, 0 AS SoloAdmin
    UNION ALL SELECT '/inscripciones'                   , 0
    UNION ALL SELECT '/manual'                          , 0
    UNION ALL SELECT '/dashboard'                       , 1
    UNION ALL SELECT '/qr-accesos'                      , 1
    UNION ALL SELECT '/agente'                          , 1
    UNION ALL SELECT '/pagos-copas'                     , 1
    UNION ALL SELECT '/caja'                            , 1
    UNION ALL SELECT '/gastos/egresos'                  , 1
    UNION ALL SELECT '/adeudos/sede'                    , 1
    UNION ALL SELECT '/ventas'                          , 1
    UNION ALL SELECT '/ventas/por-producto'             , 1
    UNION ALL SELECT '/ventas/por-dia'                  , 1
    UNION ALL SELECT '/ventas/canceladas'               , 1
    UNION ALL SELECT '/cortes-mensuales'                , 1
    UNION ALL SELECT '/ventas/por-tipo'                 , 1
    UNION ALL SELECT '/usuarios'                        , 1
    UNION ALL SELECT '/perfiles'                        , 1
) M
WHERE M.SoloAdmin = 0 OR COALESCE(P.M8, 0) >= 2;
