-- Formato de incorporacion: el paso de un jugador a otro grupo, autorizado.
--
-- Reproduce el formato que hoy se llena en Excel ("FORMATO DE INCORPORACION"), una
-- fila por jugador: quien lo propone (profesor), quien es, de que grupo viene, a cual
-- entra, por que, y la firma de quien lo autoriza.
--
-- Que se guarda y por que:
--
--   Procedencia   La categoria que el jugador tenia AL CAPTURAR, copiada de
--                 tblJugadores. Se congela a proposito: en cuanto la incorporacion se
--                 aplique, su categoria sera la nueva y el formato dejaria de decir de
--                 donde vino. Es el equivalente al "PROCEDENCIA" del papel.
--
--   Autorizacion  El NOMBRE de quien autoriza, tal como se firmo, ademas de su
--                 IdUsuario. Un formato firmado no puede cambiar de firmante porque
--                 despues alguien renombre o dé de baja al usuario.
--
--   IdTemporada   El ciclo del encabezado del formato ("CICLO AGOSTO 2024 A JULIO
--                 2025"). Es la temporada del sistema.
--
-- Esta pantalla NO mueve al jugador de categoria: deja constancia autorizada del
-- cambio. El alta formal se sigue haciendo en el sistema de escritorio, igual que el
-- resto de los movimientos de plantilla.
--
-- Nada se borra: se cancela (Status 0 = vigente, 2 = cancelada), la misma convencion
-- del resto del sistema.
--
-- InnoDB aunque el resto del esquema sea MyISAM: es una tabla nueva, solo de esta
-- aplicacion, y conviene que respete transacciones.
--
-- Para revertir:
--   DROP TABLE tblIncorporaciones;

CREATE TABLE IF NOT EXISTS tblIncorporaciones (
    IdIncorporacion   INT          NOT NULL AUTO_INCREMENT,
    IdTemporada       INT          NOT NULL,
    FechaCaptura      DATE         NOT NULL,
    IdProfesor        INT          NULL,
    IdJugador         INT          NOT NULL,
    Procedencia       VARCHAR(45)  NULL COLLATE utf8mb4_0900_ai_ci,
    GrupoIncorporar   VARCHAR(45)  NOT NULL COLLATE utf8mb4_0900_ai_ci,
    Justificacion     VARCHAR(500) NULL COLLATE utf8mb4_0900_ai_ci,
    IdUsuarioAutoriza INT          NULL,
    Autorizacion      VARCHAR(245) NULL COLLATE utf8mb4_0900_ai_ci,
    FechaAutorizacion DATETIME     NULL,
    Status            INT          NOT NULL DEFAULT 0,
    IdUsuarioAlta     INT          NULL,
    FechaAlta         DATETIME     NULL,
    FechaAct          DATETIME     NULL,
    PRIMARY KEY (IdIncorporacion),
    KEY IX_Incorporaciones_Ciclo   (IdTemporada, Status),
    KEY IX_Incorporaciones_Jugador (IdJugador),
    KEY IX_Incorporaciones_Grupo   (GrupoIncorporar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
