-- La asistencia a clase: una marca por alumno y por dia de entrenamiento.
--
-- ── Por que una tabla nueva y no tblAsistencias ──
--
-- tblAsistencias ya existe, del sistema de escritorio, y NO sirve para esto. Tres
-- razones, y cada una sola bastaria:
--
--   1. Solo sabe decir "vino". Un renglon significa asistencia y su ausencia no
--      distingue entre "falto" y "ese dia nadie paso lista". La hoja de papel del club
--      SI los distingue —una palomita, una F, o la celda vacia— y esa diferencia es la
--      que hace que un porcentaje de asistencia signifique algo: sin ella, un dia que
--      nadie capturo se leeria como que falto el equipo entero.
--   2. No tiene llave unica sobre (equipo, jugador, fecha), asi que el mismo alumno
--      puede quedar dos veces en el mismo dia. Sin llave no hay forma de reescribir una
--      marca; solo de amontonarlas.
--   3. Es MyISAM: sin transacciones. Guardar el mes completo de un equipo son decenas
--      de renglones que deben entrar todos o ninguno.
--
-- Ademas esta abandonada: 52 renglones de 11 equipos, el ultimo de junio de 2023, y
-- nada en la aplicacion la lee. Se deja intacta por si el escritorio todavia la abre.
-- Es el mismo criterio que ya se uso con tblConvocatoriasPreciosManuales: lo que el
-- escritorio comparte no se le cambia debajo, se pone al lado.
--
-- ── El modelo ──
--
-- Un renglon es UNA marca: este alumno, en este equipo, este dia. 'A' vino y 'F' falto.
-- "Sin registrar" no es un valor: es la ausencia del renglon. Por eso la llave primaria
-- es (IdEquipo, IdJugador, Fecha) y se escribe con REPLACE: volver a pasar lista sobre
-- un dia ya capturado lo corrige en vez de duplicarlo, y desmarcar una celda borra su
-- renglon.
--
-- La fecha es DATE y no DATETIME a proposito: lo que se pasa es la lista del DIA, no de
-- una hora. Con DATETIME, dos capturas del mismo dia a distinta hora serian dos dias
-- distintos para la llave primaria, que es justo el error que tiene tblAsistencias.
--
-- El equipo va en la llave —y no solo el jugador— porque un alumno puede entrenar con
-- dos equipos (se sube de categoria, o cubre en otro grupo) y su asistencia con uno no
-- es su asistencia con el otro. La hoja es del equipo.
--
-- Para revertir:
--   DROP TABLE tblAsistenciaClases;

CREATE TABLE IF NOT EXISTS tblAsistenciaClases (
    IdEquipo  INT      NOT NULL,
    IdJugador INT      NOT NULL,
    Fecha     DATE     NOT NULL,
    -- 'A' asistio, 'F' falta. Sin renglon = sin registrar.
    Marca     CHAR(1)  NOT NULL,
    -- Quien paso lista, para poder preguntarle si algo no cuadra.
    IdUsuario INT      NULL,
    FechaAct  DATETIME NOT NULL,
    PRIMARY KEY (IdEquipo, IdJugador, Fecha),
    -- La consulta de la pantalla: el mes de un equipo.
    KEY IX_AsistenciaClases_Equipo_Fecha (IdEquipo, Fecha),
    -- La otra pregunta natural: el historial de un alumno.
    KEY IX_AsistenciaClases_Jugador_Fecha (IdJugador, Fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
