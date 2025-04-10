require("dotenv").config();
const express = require("express")
const nodemailer = require('nodemailer');

const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const port = process.env.PORT;
const host = process.env.HOST;

const EMAIL_HOST = process.env.EMAIL_HOST
const EMAIL_PORT = process.env.EMAIL_PORT

const QUEUE_CONFIRMATION_REQUEST = process.env.QUEUE_CONFIRMATION_REQUEST;
const QUEUE_ENDSCORE_REQUEST = process.env.QUEUE_ENDSCORE_REQUEST;


const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};

const queues = {
    confirmationRequest: {
        name: QUEUE_CONFIRMATION_REQUEST,
    },
    endscoreRequest: {
        name: QUEUE_ENDSCORE_REQUEST
    },
};

async function main() {
    const transporter = nodemailer.createTransport({
        host: EMAIL_HOST,
        port: EMAIL_PORT,
        ignoreTLS: true
    });

    const app = express();
    app.use(express.json());

    const amqpconn = await createAmqpConnection(amqpConfig);

    amqpconn.createConsumer(queues.confirmationRequest, async ({ content, ack, nack }) => {

        try {
            const user = content;

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Email Confirmation</title>
                </head>
                <body>
                    <h2>Welcome to Photo prestiges</h2>
                    <p>Thank you for signing up and may the best photographer win!</p>
                </body>
                </html>
            `;

            const info = await transporter.sendMail({
                from: '"Photo prestiges" <photos@example.com>',
                to: user.email,
                subject: "Succesfully signed up!",
                html: html,
            });
            ack();
            console.log('Email sent:', info.messageId);
        } catch (error) {
            nack();
            console.error('Error sending email:', error);
        }
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