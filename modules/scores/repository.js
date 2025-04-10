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
      endtime BIGINT NOT NULL COMMENT 'Unix timestamp',
    ) 
  `);

  // Create scores table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS scores (
      user_email VARCHAR(250) NOT NULL,
      competition_id VARCHAR(250) NOT NULL,
      picture_id VARCHAR(250) NOT NULL,
      score INT NOT NULL,
      PRIMARY KEY (user_email, competition_id, picture_id),
      FOREIGN KEY (competition_id) REFERENCES competitions(competition_id),
    ) 
  `);
}

function createScoresRepository(pool) {
    return {
        createCompetition: (competitionId, starttime, endtime) => createCompetition(pool, competitionId, starttime, endtime),
        getCompetition: (competitionId) => getCompetition(pool, competitionId),
        addScore: (userEmail, competitionId, pictureId, score) => addScore(pool, userEmail, competitionId, pictureId, score),
        getScoresForCompetition: (competitionId) => getScoresForCompetition(pool, competitionId),
        getUserScores: (userEmail) => getUserScores(pool, userEmail)
    };
}

async function createCompetition(competitionId, starttime, endtime) {
    const [result] = await this.pool.execute(
      `INSERT INTO competitions (competitionId, starttime, endtime) 
       VALUES (?, ?, ?)`,
      [competitionId, starttime, endtime]
    );
    return result.insertId;
  }

  async function getCompetition(competitionId) {
    const [rows] = await this.pool.execute(
      `SELECT * FROM competitions WHERE competitionId = ?`,
      [competitionId]
    );
    return rows[0];
  }

  async function addScore(userEmail, competitionId, pictureId, score) {
    await this.pool.execute(
      `INSERT INTO scores (user_email, competition_id, picture_id, score)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score)`,
      [userEmail, competitionId, pictureId, score]
    );
  }

  async function getScoresForCompetition(competitionId) {
    const [rows] = await this.pool.execute(
      `SELECT user_email, picture_id, score 
       FROM scores 
       WHERE competition_id = ?
       ORDER BY score DESC`,
      [competitionId]
    );
    return rows;
  }

  async function getUserScores(competitionId,userEmail) {
    const [rows] = await this.pool.execute(
      `SELECT competition_id, picture_id, score 
       FROM scores 
       WHERE user_email = ? AND competition_id = ?`,
      [userEmail, competitionId]
    );
    return rows;
  }



module.exports = {
    createDbPool : createDbPool,
    doMigration : doMigration,
    createScoresRepository: createScoresRepository,
}