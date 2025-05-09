require("dotenv").config();
const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;
const { storeTimerToDB, connectToMongoDB } = require("./repository.js");

const amqpConfig = {
    url: process.env.AMQP_HOST,
    reconnectDelay: 3000
};
const queues = {
    receivedTimerStartedQueue: {
        name: process.env.QUEUE_RECEIVE_TIMER_STARTED,
    },
    sendTimerEndedQueue: {
        name: process.env.QUEUE_SEND_TIMER_ENDED,
    },
    sendRegistrationEndedQueue: {
        name: process.env.QUEUE_SEND_REGISTRATION_ENDED,
    },
};

const REQUIRED_ENV_VARS = [
    "MONGO_DB","MONGO_URI", "MONGO_USER", "MONGO_PASSWORD",
    "QUEUE_RECEIVE_TIMER_STARTED", "QUEUE_SEND_TIMER_ENDED", "QUEUE_SEND_REGISTRATION_ENDED"
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
        const timerDuration = content.endTimeStamp - content.startTimeStamp;

        setTimeout(async () => {
            const { competition_id } = content;

            if (timer) {
                Promise.all([
                    sendTimerEndedQueue.send({
                        body: {
                            competition_id: competition_id
                        }
                    }),
                    sendRegistrationEndedQueue.send({
                        body: {
                            competition_id: competition_id
                        }
                    })
                ]);
            }
        }
        , timerDuration);
    }

    
    
    async function storeTimer(content){
        const { startTimeStamp, endTimeStamp, competition_id } = content;
    
        
        const timer = {
            competition_id: competition_id,
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