require("dotenv").config();
const mysql = require("mysql2/promise");

async function createDbPool() {
    const pool = mysql.createPool({
        host: process.env.HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        port: process.env.DB_PORT
    });
    console.log("Db connection started")
    await doMigration(pool);
    return pool;
}

async function doMigration(pool) {
    await pool.execute(`
    CREATE TABLE IF NOT EXISTS users (
        username varchar(250) PRIMARY KEY NOT NULL,
        email varchar(250) NOT NULL,
        password varchar(250) NOT NULL
    )`);
}

function createUserRepository(pool) {
    return {
        updateUserConfirmed: (username) => updateUserConfirmed(pool, username),
        saveUser: (user) => saveUser(pool, user),
        findUser: (username) => findUser(pool, username),
    };
}
async function updateUserConfirmed(pool, username) {
    await pool.execute(
        `UPDATE users SET confirmed = ? WHERE username = ?`,
        [1, username]
    );
}

async function saveUser(pool, user) {
    await pool.execute(
        `INSERT IGNORE INTO users (username, email, password)
         VALUES (?, ?, ?)`,
        [user.username, user.email, user.password]
    );
}

async function findUser(pool, username) {
    const [rows] = await pool.execute(
        `SELECT username, email, password FROM users WHERE username = ?`,
        [username]
    );

    if (rows.length > 0) {
        return rows[0];
    } else {
        throw new Error("No user found");
    }
}


module.exports = {
    createDbPool : createDbPool,
    doMigration : doMigration,
    createUserRepository: createUserRepository,
}