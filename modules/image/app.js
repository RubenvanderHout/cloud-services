require("dotenv").config();
const { URL, URLSearchParams } = require('url');
const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const CATEGORYID = "personal_photos";

const REQUIRED_ENV_VARS = [
    "API_KEY",
    "API_SECRET",
];

function parseEnvVariables(requiredVars) {
    const missing = requiredVars.filter(varName => !(varName in process.env));

    if (missing.length > 0) {
        console.error('Missing environment variables:', missing.join(', '));
        // Handle missing variables (e.g., exit process)
        process.exit(1);
    }
}


const API_KEY =  process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};

const queues = {
    receivedComparedImageQueue: {
        name: 'receivedComparedImageQueue',
    },
    sendComparedImageQueue: {
        name: 'sendComparedImageQueue',
    },
};


function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const amqpconn = createAmqpConnection(amqpConfig);

    const sendComparedImageQueue = amqpconn.createProducer(queues.sendComparedImageQueue);

    amqpconn.createConsumer(queues.receivedComparedImageQueue, async ({ content, ack }) => {
        const { competitionId, submissionTime, url1, url2, useremail } = content.body;
        // pull image from bucket. One corresponding to the pictureId and the other to the competitionId

        const distance = await compareImages(url1, url2);

        sendComparedImageQueue.send({
            body: {
                competitionId: competitionId,
                submissionTime: submissionTime,
                distance: distance,
                useremail: useremail
            }
        });
        ack();
    })
}


async function compareImages(url1, url2) {
    const comparisonEndpoint = 'https://api.imagga.com/v2/images-similarity/categories/' + CATEGORYID;
   
    const authString = `${API_KEY}:${API_SECRET}`;
    const authBase64 = Buffer.from(authString).toString('base64');
    

    const url = new URL(comparisonEndpoint);
    url.searchParams.append('image_url', url1);
    url.searchParams.append('image2_url', url2);
    
    try {
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${authBase64}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        
        return data.result.distance;
    } catch (error) {
        console.error('Error comparing images:', error);
        throw error;
    }
}

main();