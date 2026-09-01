-- Plantilla de Equipos: donde se para cada jugador en la cancha, y el auxiliar tecnico.
--
-- ── tblEquiposPlantilla ──
--
-- Una fila por jugador colocado, con la llave (IdEquipo, IdJugador): un jugador esta en
-- un solo lugar de la cancha de su equipo, y el mismo jugador puede estar colocado en
-- otro equipo sin estorbar.
--
-- Las coordenadas van en PORCENTAJE de la cancha (0 a 100), no en pixeles. La hoja se
-- ve en pantallas de distinto ancho y ademas se exporta a PDF con otras medidas; en
-- pixeles, una plantilla acomodada en un monitor grande saldria con los jugadores
-- fuera del campo en cualquier otro lado. En porcentaje el acomodo es el mismo en todos.
--
-- X = 0 es la banda izquierda y X = 100 la derecha; Y = 0 es la porteria de arriba
-- (donde va el portero) y Y = 100 la de abajo. DECIMAL(5,2) da centesimas de cancha,
-- que es mas fino de lo que la mano puede colocar.
--
-- NO se guarda aqui quien pertenece al equipo: eso ya lo dice tblJugadores.IdEquipo.
-- Esta tabla solo dice DONDE se para, y por eso un jugador sin fila simplemente sale
-- todavia sin colocar. Al sacar a un jugador de la cancha se borra su fila.
--
-- MyISAM para igualar al resto del esquema (tblJugadores, tblEquipos y tblLigas lo son),
-- que es lo que permite que el sistema de escritorio la lea sin sorpresas.
--
-- Para revertir:
--   DROP TABLE tblEquiposPlantilla;

CREATE TABLE IF NOT EXISTS tblEquiposPlantilla (
    IdEquipo  INT           NOT NULL,
    IdJugador INT           NOT NULL,
    X         DECIMAL(5,2)  NOT NULL DEFAULT 50.00,
    Y         DECIMAL(5,2)  NOT NULL DEFAULT 50.00,
    FechaAct  DATETIME      NULL,
    PRIMARY KEY (IdEquipo, IdJugador),
    KEY IX_Plantilla_Jugador (IdJugador)
) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4;

-- ── El auxiliar tecnico ──
--
-- El DT ya existe: tblEquipos.IdEntrenador, que es el que ya pinta Convocatorias y el
-- selector de equipos de la ficha del jugador. El auxiliar no tenia donde vivir, y en
-- la hoja va en su propio renglon debajo del DT.
--
-- Se agrega como columna del equipo, y no como texto suelto de la hoja, para que sea el
-- mismo usuario del catalogo que el DT: asi el auxiliar de un equipo es una persona del
-- sistema y no un nombre tecleado que nadie puede cruzar con nada.
--
-- Es NULL-able y sin valor por omision, asi que los 400+ equipos que ya existen siguen
-- exactamente igual y el sistema de escritorio no se entera: frmCapEquipo y frmSelEquipo
-- nombran sus columnas, nunca hacen INSERT con lista posicional.
--
-- Para revertir:
--   ALTER TABLE tblEquipos DROP COLUMN IdAuxiliar;

ALTER TABLE tblEquipos ADD COLUMN IdAuxiliar INT NULL;
