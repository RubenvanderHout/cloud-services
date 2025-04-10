require("dotenv").config();
const express = require("express");

const RepositoryModule = require("./repository");
const createDbPool = RepositoryModule.createDbPool;
const createScoresRepository = RepositoryModule.createScoresRepository;

const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const REQUIRED_ENV_VARS = [
    "PORT", "HOST", "DB_DATABASE",
    "DB_USER", "DB_PASSWORD", "DB_PORT",
    "AMQP_HOST", "QUEUE_COMPETITION_CREATED",
    "QUEUE_SEND_END_SCORES", "QUEUE_RECEIVE_REGISTRATION_ENDED"
];

function parseEnvVariables(requiredVars) {
    const missing = requiredVars.filter(varName => !(varName in process.env));

    if (missing.length > 0) {
        console.error('Missing environment variables:', missing.join(', '));
        // Handle missing variables (e.g., exit process)
        process.exit(1);
    }
}

const port = process.env.PORT
const host = process.env.HOST

const receivedCompetitionCreatedQueue = process.env.QUEUE_COMPETITION_CREATED;
const sendEndScoresQueue = process.env.QUEUE_SEND_END_SCORES;
const receivedRegistrationEndedQueue = process.env.QUEUE_RECEIVE_REGISTRATION_ENDED;
const receivedSubmissionQueue = process.env.QUEUE_RECEIVE_SUBMISSION;
const receivedSubmissionDeletedQueue = process.env.QUEUE_RECEIVE_SUBMISSION_DELETED;

const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};

const queues = {
    receivedCompetitionCreatedQueue: {
        name: receivedCompetitionCreatedQueue,
    },
    sendEndScoresQueue: {
        name: sendEndScoresQueue,
    },
    receivedRegistrationEndedQueue: {
        name: receivedRegistrationEndedQueue,
    },
    receivedSubmissionQueue: {
        name: receivedSubmissionQueue,
    },
    receivedSubmissionDeletedQueue: {
        name: receivedSubmissionDeletedQueue,
    }
};

async function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const app = express();
    app.use(express.json());

    const pool = await createDbPool();
    const scores = createScoresRepository(pool);

    const amqpconn = await createAmqpConnection(amqpConfig);
    const sendEndScoresQueue = amqpconn.createProducer(queues.sendEndScoresQueue);

    amqpconn.createConsumer(queues.receivedCompetitionCreatedQueue, async ({ content, ack }) => {
        scores.createCompetition(content);
        ack();
    });

    amqpconn.createConsumer(queues.receivedSubmissionQueue, async ({ content, ack }) => {
        const { competitionId, submissionTime, distance, useremail } = content;
        const competition = await scores.getCompetition(competitionId);

        if (!competition) {
            console.error(`Competition with ID ${competitionId} not found`);
            ack();
            return;
        }

        const { endtime, starttime } = competition;
        const score = calculateScore(endtime, starttime, submissionTime, distance);
        await scores.saveScore(competitionId, useremail, score);
        ack();
    });


    amqpconn.createConsumer(queues.receivedRegistrationEndedQueue, async ({ content, ack }) => {
        const { competitionId } = content;
        const competition = await scores.getCompetition(competitionId);
        if (!competition) {
            console.error(`Competition with ID ${competitionId} not found`);
            ack();
            return;
        }
        const scoresList = await scores.getScores(competitionId);
        if (!scoresList) {
            console.error(`No scores found for competition with ID ${competitionId}`);
            ack();
            return;
        }

        sendEndScoresQueue.send({
            body: {
                competitionId: competitionId,
                scoresList: scoresList
            }
        });
        
        ack();
    });

    amqpconn.createConsumer(queues.receivedSubmissionDeletedQueue, async ({ content, ack }) => {
        const { competitionId, useremail } = content;
        await scores.deleteScore(competitionId, useremail);
        ack();
    });

   


    app.get('/api/scores/:competitionId', async (req, res) => {
        const competitionId = req.params.competitionId;
        const scoresList = await scores.getScores(competitionId);

        if (!scoresList) {
            return res.status(404).json({ message: 'Competition not found' });
        }

        res.json(scoresList);
    });

    app.get('/api/scores/:competitionId/:useremail', async (req, res) => {
        const competitionId = req.params.competitionId;
        const useremail = req.params.useremail;
        const scoresList = await scores.getUserScores(competitionId, useremail);

        if (!scoresList) {
            return res.status(404).json({ message: 'Competition not found' });
        }

        res.json(scoresList);
    });


    // Graceful shutdown
    process.on('SIGINT', async () => {
    await amqpconn.closeAll();
    process.exit(0);
    });

    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });


}

main();

function calculateMaxScore(endtime, starttime) {
    const maxTime = endtime - starttime; // highest possible score for time
    const maxDistance = 100; // highest possible score for distance
    const maxScore = maxDistance + maxTime; // highest possible score
    return maxScore;
}

function calculateScore(endtime, startTime, submissionTime, distance) {
    const timeScore = endtime - submissionTime; // time score
    const distanceScore = 100 - distance; // distance score

    // actual score is a percentage of the max score
    const score = ((timeScore + distanceScore) / calculateMaxScore(endtime, startTime)) * 100; // percentage of max score
    return score;
}
    
