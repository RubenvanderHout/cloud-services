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
    "AMQP_HOST",
    "QUEUE_COMPETITION_CREATED_TARGET_SCORE",
    "QUEUE_SEND_END_SCORES_SCORE_EMAIL",
    "QUEUE_RECEIVE_REGISTRATION_ENDED_CLOCK_SCORE",
    "QUEUE_RECEIVE_SUBMISSION_IMAGE_SCORE",
    "QUEUE_RECEIVE_SUBMISSION_DELETED_TARGET_SCORE",
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

const receivedCompetitionCreatedQueue = process.env.QUEUE_COMPETITION_CREATED_TARGET_SCORE;
const sendEndScoresQueue = process.env.QUEUE_SEND_END_SCORES_SCORE_EMAIL;
const receivedRegistrationEndedQueue = process.env.QUEUE_RECEIVE_REGISTRATION_ENDED_CLOCK_SCORE;
const receivedSubmissionQueue = process.env.QUEUE_RECEIVE_SUBMISSION_IMAGE_SCORE;
const receivedSubmissionDeletedQueue = process.env.QUEUE_RECEIVE_SUBMISSION_DELETED_TARGET_SCORE;

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
        const { competition_id, start_timestamp, end_timestamp } = await content;
        console.info(`Received competition created event: ${competition_id}`);
        console.info(`Competition start time: ${start_timestamp}`);   
        console.info(`Competition end time: ${end_timestamp}`);

        scores.createCompetition(competition_id, start_timestamp, end_timestamp);
        console.info(`Competition ${competition_id} created in DB`);
        ack();
    });

    amqpconn.createConsumer(queues.receivedSubmissionQueue, async ({ content, ack }) => {
        const { competition_id, submission_time, distance, user_email } = content;
        const competition = await scores.getCompetition(competition_id);

        if (!competition) {
            console.error(`Competition with ID ${competition_id} not found`);
            ack();
            return;
        }

        const { endtime, starttime } = competition;
        const score = calculateScore(endtime, starttime, submission_time, distance);
        console.info(`Calculated score for user ${user_email} in competition ${competition_id}: ${score}`);
        await scores.addScore(user_email, competition_id, score);
        ack();
    });


    amqpconn.createConsumer(queues.receivedRegistrationEndedQueue, async ({ content, ack }) => {
        const { competition_id } = content;
        console.info(`Received registration ended event for competition: ${competition_id}`);

        const competition = await scores.getCompetition(competition_id);
        if (!competition) {
            console.error(`Competition with ID ${competition_id} not found`);
            ack();
            return;
        }
        const scoresList = await scores.getScoresForCompetition(competition_id);
        if (!scoresList) {
            console.error(`No scores found for competition with ID ${competition_id}`);
            ack();
            return;
        }

        sendEndScoresQueue.send({
            body: {
                competition_id: competition_id,
                scores_list: scoresList
            }
        });

        ack();
    });

    amqpconn.createConsumer(queues.receivedSubmissionDeletedQueue, async ({ content, ack }) => {
        const { competition_id, user_email } = content;
        await scores.deleteScore(competition_id, user_email);
        ack();
    });




    app.get('/api/scores/:competition_id', async (req, res) => {
        const competition_id = req.params.competition_id;
        const scoresList = await scores.getScoresForCompetition(competition_id);

        if (!scoresList) {
            return res.status(404).json({ message: 'Competition not found' });
        }

        res.json(scoresList);
    });

    app.get('/api/scores/:competition_id/:user_email', async (req, res) => {
        const competition_id = req.params.competition_id;
        const user_email = req.params.user_email;
        const scoresList = await scores.getUserScores(competition_id, user_email);

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
    return endtime - starttime; 
}

function calculateScore(endtime, startTime, submission_time, distance) {
    const timeScore = endtime - submission_time; // time score
    let distanceScore = Math.round(distance*100); // distance score, used as penalty

    // actual score is a percentage of the max score
    const score = ((timeScore - distanceScore) / calculateMaxScore(endtime, startTime)) * 100; // percentage of max score

    return score;
}
