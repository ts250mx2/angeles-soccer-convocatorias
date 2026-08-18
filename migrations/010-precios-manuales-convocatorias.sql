-- Precios de convocatoria fijados a mano.
--
-- El precio de un convocado sale del producto de la liga con su BecaLigas aplicada, y
-- la pantalla de Convocatorias lo pone al corriente en cada visita para que un cambio
-- de tarifa llegue a las convocatorias vigentes. Eso pisaba los ajustes hechos a mano:
-- el precio especial de un jugador duraba hasta la siguiente carga de la categoría.
--
-- Es la contraparte de 009-precios-convocatorias-becaligas.sql: aquella puso de una vez
-- todos los precios al del sistema, y esta permite que un ajuste posterior sobreviva.
--
-- Esta tabla es la memoria de esos ajustes. Cambiar el precio de un jugador deja aquí
-- su marca y el sincronizado salta a los marcados; volver a ponerle el precio del
-- sistema borra la marca y el jugador regresa al automático.
--
-- Va en tabla aparte y no como columna de tblDetalleConvocatorias porque esa tabla la
-- comparte el sistema de escritorio: agregarle una columna puede romper sus inserciones,
-- crear una tabla nueva no le afecta en nada.
--
-- InnoDB (aunque el resto del esquema sea MyISAM) porque el cambio de color de una
-- convocatoria arrastra estas filas dentro de una transacción.
--
-- La llave es la misma que identifica un renglón del detalle, y las columnas de texto
-- llevan la colación de tblDetalleConvocatorias para que el JOIN no mezcle colaciones.
--
-- Para revertir:
--   DROP TABLE tblConvocatoriasPreciosManuales;

CREATE TABLE IF NOT EXISTS tblConvocatoriasPreciosManuales (
    IdJugador   INT          NOT NULL,
    IdTemporada INT          NOT NULL,
    IdLiga      INT          NOT NULL,
    Categoria   VARCHAR(45)  NOT NULL COLLATE utf8mb4_0900_ai_ci,
    Color       VARCHAR(100) NOT NULL DEFAULT '' COLLATE utf8mb4_0900_ai_ci,
    FechaAct    DATETIME     NULL,
    PRIMARY KEY (IdJugador, IdTemporada, IdLiga, Categoria, Color)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
