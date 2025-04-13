require("dotenv").config();
const AmqpModule = require("./amqp.js");
const createAmqpConnection = AmqpModule.createAmqpConnection;
const { storeTimerToDB, connectToMongoDB, getRunningTimers } = require("./repository.js");

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
        await storeTimer(content);
        startTimer(content);
        ack();
    };

    const timerRepository = await connectToMongoDB();
    const amqpconn = await createAmqpConnection(amqpConfig);
    amqpconn.createConsumer(queues.receivedTimerStartedQueue, timerReceivedHandler);
    const sendTimerEndedQueue = await amqpconn.createProducer(queues.sendTimerEndedQueue);
    const sendRegistrationEndedQueue = await amqpconn.createProducer(queues.sendRegistrationEndedQueue);
    console.log("Clock service is running...");

    await restartRunningTimers()
    
    function startTimer(content) {
        const timerDuration = content.end_timestamp - content.start_timestamp;

        setTimers(content.competition_id, timerDuration);
    }

    async function storeTimer(content) {
        const { start_timestamp, end_timestamp, competition_id } = content;


        const timer = {
            competition_id: competition_id,
            startTime: start_timestamp,
            endTime: end_timestamp,
        };

        try {
            await storeTimerToDB(timerRepository, timer);
        } catch (err) {
            console.error(err)
        }
    };

    function setTimers(competition_id, timerDuration) {
        setTimeout(async () => {


            Promise.all([
                sendTimerEndedQueue.send({
                    competition_id: competition_id
                }),
                sendRegistrationEndedQueue.send({
                    competition_id: competition_id
                })
            ]);
        }
            , timerDuration);
    }

    async function restartRunningTimers() {
        console.log("Restarting running timers...");
        getRunningTimers(timerRepository)
        .then((timers) => {
            timers.forEach(timer => {
                const timerDuration = timer.endTime - Date.now();
                setTimers(timer.competition_id, timerDuration);
            });
        })
        .catch(err => {
            console.error("Error fetching running timers:", err);
        });
    }
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

