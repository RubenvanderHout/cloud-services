require("dotenv").config();
const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;
const { storeTimerToDB, connectToMongoDB } = require("./repository.js");

const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};
const queues = {
    receivedTimerStartedQueue: {
        name: process.env.QUEUE_RECEIVE_TIMER_STARTED,
    },
    sendTimerEndedQueue: {
        name: process.env.QUEUE_SEND_TIMER_ENDED,
    }
};

const REQUIRED_ENV_VARS = [
    "MONGO_DB","MONGO_URI", "MONGO_USER", "MONGO_PASSWORD",
    "QUEUE_RECEIVE_TIMER_STARTED", "QUEUE_SEND_TIMER_ENDED"
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
    console.log("Clock service is running...");


    function startTimer(content) {
        setTimeout(async () => {
            const { competitionId } = content.body;

            if (timer) {
                await sendTimerEndedQueue.send({
                    body: {
                        competitionId: competitionId
                    }
                });
            }
        }
        , content.body.timerDuration);
    }

    
    
    async function storeTimer(content){
        const { timerDuration, competitionId } = content.body;
    
        if (timerDuration === null || typeof timerDuration !== "number" || timerDuration < 0) {
            return
        }
    
        const timer = {
            competitionId: competitionId,
            startTime: new Date(),
            endTime: new Date(Date.now() + timerDuration)
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