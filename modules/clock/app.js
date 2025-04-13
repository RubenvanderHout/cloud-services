require("dotenv").config();
const { Agenda }= require("@hokify/agenda");
const AmqpModule = require("./amqp.js");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const amqpConfig = {
    url: process.env.AMQP_HOST,
    reconnectDelay: 3000
};
const queues = {
    receivedTimerStartedQueue: {
        name: process.env.QUEUE_COMPETITION_STARTED_TARGET_CLOCK,
    },
    sendRegistrationEndedQueue: {
        name: process.env.QUEUE_REGISTRATION_ENDED_CLOCK_TARGET,
    },
    sendTimerEndedQueue: {
        name: process.env.QUEUE_TIMER_ENDED_CLOCK_SCORE,
    },
};

const REQUIRED_ENV_VARS = [
    "MONGO_DB", "MONGO_URI", "MONGO_USER", "MONGO_PASSWORD",
    "QUEUE_COMPETITION_STARTED_TARGET_CLOCK",
    "QUEUE_REGISTRATION_ENDED_CLOCK_TARGET",
    "QUEUE_TIMER_ENDED_CLOCK_SCORE",
];


async function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const timerReceivedHandler = async ({ content, ack }) => {
        await startTimer(content);
        ack();
    };

    const agenda = new Agenda({
        db: { address: process.env.MONGO_URI },
    });

    const amqpconn = await createAmqpConnection(amqpConfig);
    amqpconn.createConsumer(queues.receivedTimerStartedQueue, timerReceivedHandler);
    const sendTimerEndedQueue = await amqpconn.createProducer(queues.sendTimerEndedQueue);
    const sendRegistrationEndedQueue = await amqpconn.createProducer(queues.sendRegistrationEndedQueue);
    console.log("Clock service is running...");

    agenda.define("timerJob", async (job) => {
        const { competition_id } = job.attrs.data;

        console.log("Ran")

        sendTimerEndedQueue.send({
            competition_id: competition_id
        });
        sendRegistrationEndedQueue.send({
            competition_id: competition_id
        });
    });


    async function startTimer(content) {
        const unixTimestamp = content.end_timestamp;
        const targetDate = new Date(unixTimestamp * 1000);

        await agenda.schedule(targetDate, "timerJob", {
            competition_id: content.competition_id
        });
    }

    await agenda.start();
}

function parseEnvVariables(requiredVars) {
    const missing = requiredVars.filter(varName => !(varName in process.env));

    if (missing.length > 0) {
        console.error('Missing environment variables:', missing.join(', '));
        // Handle missing variables (e.g., exit process)
        process.exit(1);
    }
}

main();
