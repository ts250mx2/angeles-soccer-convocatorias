const mysql = require('mysql2/promise');

async function migrate() {
    const connection = await mysql.createConnection({
        host: '26.173.65.119',
        user: 'kyk',
        password: 'merkurio',
        database: 'BDAngelesSoccer'
    });

    try {
        console.log('1. Adding Color column to tblDetalleConvocatorias...');
        const [cols] = await connection.query("SHOW COLUMNS FROM tblDetalleConvocatorias LIKE 'Color'");
        if (cols.length === 0) {
            await connection.query(`
                ALTER TABLE tblDetalleConvocatorias 
                ADD COLUMN Color VARCHAR(100) NOT NULL DEFAULT '' AFTER Categoria
            `);
            console.log('Color column added.');
        }

        console.log('2. Dropping old Primary Key...');
        try {
            await connection.query('ALTER TABLE tblDetalleConvocatorias DROP PRIMARY KEY');
            console.log('Primary Key dropped.');
        } catch (e) {
            console.log('Primary Key already dropped or not found.');
        }

        console.log('3. Populating Color and duplicating records...');
        const [convocatorias] = await connection.query(`
            SELECT IdTemporada, IdLiga, Categoria, Color 
            FROM tblConvocatorias 
            WHERE Status = 0
        `);

        const groups = {};
        for (const c of convocatorias) {
            const key = `${c.IdTemporada}|${c.IdLiga}|${c.Categoria}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(c.Color);
        }

        for (const key in groups) {
            const [seasonId, leagueId, categoria] = key.split('|');
            const colors = groups[key];
            
            console.log(`Processing ${categoria} (${colors.length} colors: ${colors.join(', ')})`);

            for (let i = 0; i < colors.length; i++) {
                const color = colors[i];
                if (i === 0) {
                    await connection.query(`
                        UPDATE tblDetalleConvocatorias 
                        SET Color = ? 
                        WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND (Color = '' OR Color IS NULL)
                    `, [color, seasonId, leagueId, categoria]);
                } else {
                    await connection.query(`
                        INSERT IGNORE INTO tblDetalleConvocatorias (IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, IdEquipo, Categoria, EsPagado, Color)
                        SELECT IdJugador, IdTemporada, IdLiga, Precio, EsConvocado, EsEliminado, IdEquipo, Categoria, EsPagado, ?
                        FROM tblDetalleConvocatorias
                        WHERE IdTemporada = ? AND IdLiga = ? AND Categoria = ? AND Color = ?
                    `, [color, seasonId, leagueId, categoria, colors[0]]);
                }
            }
        }

        console.log('4. Adding new Primary Key...');
        await connection.query(`
            ALTER TABLE tblDetalleConvocatorias 
            ADD PRIMARY KEY (IdJugador, IdTemporada, IdLiga, Categoria, Color)
        `);
        console.log('New Primary Key added.');

        console.log('Migration completed successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await connection.end();
    }
}

migrate();
