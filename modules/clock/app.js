require("dotenv").config();
const AmqpModule = require("./amqp.js");
const createAmqpConnection = AmqpModule.createAmqpConnection;
const { storeTimerToDB, connectToMongoDB } = require("./repository.js");

const amqpConfig = {
    url: 'amqp://localhost',
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
    "MONGO_DB","MONGO_URI", "MONGO_USER", "MONGO_PASSWORD",
    "QUEUE_COMPETITION_STARTED_TARGET_CLOCK",
    "QUEUE_REGISTRATION_ENDED_CLOCK_TARGET",
    "QUEUE_TIMER_ENDED_CLOCK_SCORE",
];

async function main(){
    parseEnvVariables(REQUIRED_ENV_VARS);

    const timerReceivedHandler = async ({ content, ack }) => {
        await storeTimer(content);
        startTimer(content);
        ack();
    };

    const timerRepository = await connectToMongoDB();
    const amqpconn = await createAmqpConnection(amqpConfig);
    amqpconn.createConsumer(queues.receivedTimerStartedQueue, timerReceivedHandler);
    const sendTimerEndedQueue = amqpconn.createProducer(queues.sendTimerEndedQueue);
    const sendRegistrationEndedQueue = amqpconn.createProducer(queues.sendRegistrationEndedQueue);
    console.log("Clock service is running...");


    function startTimer(content) {
        const timerDuration = content.body.endTimeStamp - content.body.startTimeStamp;

        setTimeout(async () => {
            const { competitionId } = content.body;

            if (timer) {
                Promise.all([
                    sendTimerEndedQueue.send({
                        body: {
                            competitionId: competitionId
                        }
                    }),
                    sendRegistrationEndedQueue.send({
                        body: {
                            competitionId: competitionId
                        }
                    })
                ]);
            }
        }
        , timerDuration);
    }



    async function storeTimer(content){
        const { startTimeStamp, endTimeStamp, competitionId } = content.body;


        const timer = {
            competitionId: competitionId,
            startTime: startTimeStamp,
            endTime: endTimeStamp,
        };

        try {
            await storeTimerToDB(timerRepository, timer);
        } catch (err) {
            console.error(err)
        }
    };
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