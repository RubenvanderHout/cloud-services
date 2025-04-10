require("dotenv").config();
const { URL, URLSearchParams } = require('url');
const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

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


const apiKey =  process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};

const queues = {
    
};


function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const amqpconn = createAmqpConnection(amqpConfig);
}



async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

async function uploadImage(imagePath, apiKey, apiSecret, user) {
    console.log('Uploading image:', imagePath);
    const categorizerEndpoint = 'https://api.imagga.com/v2/categories/general_v3/';
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('image', imagePath);
    
    const authHeader = 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64');
    const headers = {
        Authorization: authHeader,
        ...formData.getHeaders()
    };
    
    const params = new URLSearchParams({
        save_id: user,
        save_index: "picturemmo"
    });

    try {
        const response = await new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const response = await fetch(`${categorizerEndpoint}?${params}`, {
                        method: 'POST',
                        headers: headers,
                        body: formData
                    });
                    const data = await response.json();
                    if (!response.ok) throw data;
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            }, 500); // Delay of 500 milliseconds
        });
        return response.result.upload_id;
    } catch (error) {
        console.error('Error uploading image:');
        console.error('Error:', error);
        throw error;
    }
}

async function trainIndex(apiKey, apiSecret) {
    const indexEndpoint = `https://api.imagga.com/v2/similar-images/categories/general_v3/picturemmo`;
    let ticketId = '';

    try {
        const response = await fetch(indexEndpoint, {
            method: 'PUT',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
            }
        });
        const data = await response.json();
        if (!response.ok) throw data;
        ticketId = data.result.ticket_id;
    } catch (error) {
        console.error('Exception occurred when processing the train call response');
        console.error('Error:', error);
        throw error;
    }

    return ticketId;
}

async function isResolved(ticketId, apiKey, apiSecret) {
    const ticketsEndpoint = `https://api.imagga.com/v2/tickets/${ticketId}`;
    let resolved = false;

    try {
        const response = await fetch(ticketsEndpoint, {
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
            }
        });
        const data = await response.json();
        if (!response.ok) throw data;
        resolved = data.result.is_final;
    } catch (error) {
        console.error('Exception occurred during the ticket status check');
        console.error('Error:', error);
        throw error;
    }

    return resolved;
}

async function compareImages(referenceImage, distanceThreshold, apiKey, apiSecret) {
    const comparisonEndpoint = 'https://api.imagga.com/v2/similar-images/categories/general_v3/picturemmo';
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('image', referenceImage);

    try {
        const url = new URL(comparisonEndpoint);
        url.searchParams.append('distance', distanceThreshold);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Basic ' + Buffer.from(`${apiKey}:${apiSecret}`).toString('base64'),
                ...formData.getHeaders()
            },
            body: formData
        });
        
        const data = await response.json();
        if (!response.ok) throw data;
        return data.result;
    } catch (error) {
        console.error('Error comparing images:');
        console.error('Error:', error);
        throw error;
    }
}

main();