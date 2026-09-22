-- Preregistros colocados en la cancha de la Plantilla de Equipos.
--
-- ── Por que una tabla aparte y no una columna en tblEquiposPlantilla ──
--
-- Un preregistro NO es un jugador: vive en tblJugadoresPre, con su propio contador de
-- IdJugadorPre que arranca desde 1 y se pisa con los IdJugador de tblJugadores. El
-- preregistro 45 y el jugador 45 no tienen nada que ver entre si.
--
-- Meterlos en la misma tabla obligaria a una columna discriminadora y a cambiarle la
-- llave primaria a tblEquiposPlantilla, que ya tiene el acomodo de los equipos armados.
-- Una llave mal migrada ahi se lleva por delante plantillas que ya existen, y a cambio
-- de nada: el DELETE + INSERT del guardado es identico en las dos tablas, y separarlas
-- hace imposible que un id se lea como el del otro espacio.
--
-- Para revertir:
--   DROP TABLE tblEquiposPlantillaPre;
--
-- ── La forma es la misma que tblEquiposPlantilla ──
--
-- Coordenadas en PORCENTAJE de la cancha (0 a 100), no en pixeles, por la misma razon
-- que alla: la hoja se ve en pantallas de distinto ancho y se exporta a PDF con otras
-- medidas. X = 0 es la banda izquierda; Y = 0 es la porteria de arriba.
--
-- Tampoco se guarda aqui a que equipo pertenece el preregistro: eso lo dice
-- tblJugadoresPre.Categoria (el nombre del equipo, como en tblJugadores.Categoria) junto
-- con su IdSede. Esta tabla solo dice DONDE se para, y quien no tiene fila sale todavia
-- sin colocar. Al sacarlo de la cancha se borra su fila.
--
-- MyISAM para igualar al resto del esquema, igual que tblEquiposPlantilla.

CREATE TABLE IF NOT EXISTS tblEquiposPlantillaPre (
    IdEquipo     INT           NOT NULL,
    IdJugadorPre INT           NOT NULL,
    X            DECIMAL(5,2)  NOT NULL DEFAULT 50.00,
    Y            DECIMAL(5,2)  NOT NULL DEFAULT 50.00,
    FechaAct     DATETIME      NULL,
    PRIMARY KEY (IdEquipo, IdJugadorPre),
    KEY IX_PlantillaPre_JugadorPre (IdJugadorPre)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

-- ── El indice que hace barata la consulta de la hoja ──
--
-- La plantilla busca sus preregistros por (Categoria, IdSede): los de ESTE equipo en
-- ESTA sede. Sin indice es un recorrido completo de tblJugadoresPre en cada apertura de
-- la hoja; son 184 filas hoy, pero la tabla crece con cada captura de recepcion y la
-- consulta corre en cada cambio de equipo.
--
-- Va con guardia porque MySQL no tiene ADD INDEX IF NOT EXISTS y las migraciones de
-- este proyecto tienen que poder correrse dos veces sin hacer dano: sin la guardia, la
-- segunda corrida muere con "Duplicate key name" a media migracion.
--
-- Para revertir:
--   ALTER TABLE tblJugadoresPre DROP INDEX IX_JugadoresPre_Categoria;

SET @existe := (
    SELECT COUNT(*) FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'tblJugadoresPre'
       AND INDEX_NAME = 'IX_JugadoresPre_Categoria'
);

SET @sql := IF(@existe > 0,
    'SELECT 1',
    'ALTER TABLE tblJugadoresPre ADD INDEX IX_JugadoresPre_Categoria (Categoria, IdSede)'
);

PREPARE aplicar FROM @sql;
EXECUTE aplicar;
DEALLOCATE PREPARE aplicar;
