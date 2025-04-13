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
   // Create competitions table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS competitions (
      competition_id VARCHAR(250) PRIMARY KEY NOT NULL,
      starttime BIGINT NOT NULL COMMENT 'Unix timestamp',
      endtime BIGINT NOT NULL COMMENT 'Unix timestamp'
    )`);

  // Create scores table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS scores (
      user_email VARCHAR(250) NOT NULL,
      competition_id VARCHAR(250) NOT NULL,
      picture_id VARCHAR(250) NOT NULL,
      score INT NOT NULL,
      PRIMARY KEY (user_email, competition_id, picture_id),
      FOREIGN KEY (competition_id) REFERENCES competitions(competition_id)
    )`);
}

function createScoresRepository(pool) {
    return {
        createCompetition: (competition_id, starttime, endtime) => createCompetition(pool, competition_id, starttime, endtime),
        getCompetition: (competition_id) => getCompetition(pool, competition_id),
        addScore: (user_email, competition_id, pictureId, score) => addScore(pool, user_email, competition_id, pictureId, score),
        getScoresForCompetition: (competition_id) => getScoresForCompetition(pool, competition_id),
        getUserScores: (user_email) => getUserScores(pool, user_email),
        deleteScore: (competition_id, user_email) => deleteScore(pool, competition_id, user_email),
    };
}

async function createCompetition(pool, competition_id, starttime, endtime) {
    const [result] = await pool.execute(
      `INSERT INTO competitions (competition_id, starttime, endtime)
       VALUES (?, ?, ?)`,
      [competition_id, starttime, endtime]
    );
    return result.insertId;
  }

  async function getCompetition(pool, competition_id) {
    const [rows] = await pool.execute(
      `SELECT * FROM competitions WHERE competition_id = ?`,
      [competition_id]
    );
    return rows[0];
  }

  async function addScore(pool, user_email, competition_id, pictureId, score) {
    await pool.execute(
      `INSERT INTO scores (user_email, competition_id, picture_id, score)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score)`,
      [user_email, competition_id, pictureId, score]
    );
  }

  async function getScoresForCompetition(pool, competition_id) {
    const [rows] = await pool.execute(
      `SELECT user_email, picture_id, score
       FROM scores
       WHERE competition_id = ?
       ORDER BY score DESC`,
      [competition_id]
    );
    return rows;
  }

  async function getUserScores(pool, competition_id,user_email) {
    const [rows] = await pool.execute(
      `SELECT competition_id, picture_id, score
       FROM scores
       WHERE user_email = ? AND competition_id = ?`,
      [user_email, competition_id]
    );
    return rows;
  }

  async function deleteScore(pool, competition_id, user_email) {
    await pool.execute(
      `DELETE FROM scores
       WHERE competition_id = ? AND user_email = ?`,
      [competition_id, user_email]
    );
  }



module.exports = {
    createDbPool : createDbPool,
    doMigration : doMigration,
    createScoresRepository: createScoresRepository,
}