require("dotenv").config();
const { URL } = require('url');
const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const CATEGORYID = "personal_photos";

const REQUIRED_ENV_VARS = [
    "API_KEY",
    "API_SECRET",
    "QUEUE_PHOTO_UPLOADED",
    "QUEUE_PHOTO_SCORED",
];

function parseEnvVariables(requiredVars) {
    const missing = requiredVars.filter(varName => !(varName in process.env));

    if (missing.length > 0) {
        console.error('Missing environment variables:', missing.join(', '));
        // Handle missing variables (e.g., exit process)
        process.exit(1);
    }
}


const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const receivedPhotoQueue = process.env.QUEUE_PHOTO_UPLOADED;
const sendScoreSubmissionQueue = process.env.QUEUE_PHOTO_SCORED;

const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};

const queues = {
    receivedPhotoQueue: {
        name: receivedPhotoQueue,
    },
    sendScoreSubmissionQueue: {
        name: sendScoreSubmissionQueue,
    },
};


async function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const amqpconn = await createAmqpConnection(amqpConfig);

    const sendComparedImageQueue = await amqpconn.createProducer(queues.sendScoreSubmissionQueue);

    amqpconn.createConsumer(queues.receivedPhotoQueue, async ({ content, ack }) => {
        const { competition_id, submission_time, target_image_url, submission_image_url, user_email } = content;
        console.log("Received urls: ");
        console.log("Target image URL: ", target_image_url);
        console.log("Submission image URL: ", submission_image_url);


        const distance = await compareImages(target_image_url, submission_image_url);
        console.log("Distance: ", distance);

        sendComparedImageQueue.send({
            competition_id: competition_id,
            submission_time: submission_time,
            distance: distance,
            user_email: user_email

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