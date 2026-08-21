-- Preinscripciones de incorporacion: lo que llega por el QR publico.
--
-- Es el hermano chico de tblJugadoresPre. Aquel recoge el alta completa de un jugador
-- nuevo (domicilio, tutores, escuela); este recoge lo minimo para volver a llamar a
-- alguien que quiere incorporarse a un grupo: nombre, año de nacimiento, telefono, el
-- equipo (la letra del grupo: A, B, C, D, X) y un comentario.
--
-- Va en tabla aparte y no como columnas de tblJugadoresPre porque son dos embudos
-- distintos: uno es "quiero inscribirme en la academia" y el otro "quiero cambiarme /
-- sumarme a un equipo". Mezclarlos obligaria a dejar medio formulario vacio en cada
-- alta y a filtrar por un tipo en todas las consultas.
--
-- NO hay sede: el QR de incorporaciones es uno solo para toda la academia, a diferencia
-- del preregistro de jugadores, que tiene un codigo por sede. Quien contesta el
-- formulario todavia no pertenece a ninguna.
--
-- IdIncorporacion queda en 0 hasta que alguien capture el formato a partir de este
-- contacto; asi se distingue lo atendido de lo pendiente sin borrar nada.
--
-- Status sigue la convencion del resto: 0 vigente, 2 descartado.
--
-- Para revertir:
--   DROP TABLE tblIncorporacionesPre;

CREATE TABLE IF NOT EXISTS tblIncorporacionesPre (
    IdIncorporacionPre INT          NOT NULL AUTO_INCREMENT,
    Jugador            VARCHAR(245) NOT NULL COLLATE utf8mb4_0900_ai_ci,
    AnioNacimiento     INT          NULL,
    Telefono           VARCHAR(45)  NULL COLLATE utf8mb4_0900_ai_ci,
    Equipo             VARCHAR(145) NULL COLLATE utf8mb4_0900_ai_ci,
    Comentarios        VARCHAR(500) NULL COLLATE utf8mb4_0900_ai_ci,
    IdIncorporacion    INT          NOT NULL DEFAULT 0,
    Status             INT          NOT NULL DEFAULT 0,
    FechaAlta          DATETIME     NULL,
    FechaAct           DATETIME     NULL,
    PRIMARY KEY (IdIncorporacionPre),
    KEY IX_IncorporacionesPre_Estado (Status, FechaAlta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
