import mysql from 'mysql2/promise';

const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

declare global {
    var mysqlPool: mysql.Pool | undefined;
}

export const pool = globalThis.mysqlPool || mysql.createPool(poolConfig);

if (process.env.NODE_ENV !== 'production') {
    globalThis.mysqlPool = pool;
}

