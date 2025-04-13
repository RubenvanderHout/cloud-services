require("dotenv").config();
const nodemailer = require('nodemailer');

const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;


const EMAIL_HOST = process.env.EMAIL_HOST
const EMAIL_PORT = process.env.EMAIL_PORT

const QUEUE_CONFIRMATION_REQUEST = process.env.QUEUE_CONFIRMATION_REQUEST_AUTH_EMAIL;
const QUEUE_ENDSCORE_REQUEST = process.env.QUEUE_ENDSCORE_REQUEST_SCORE_EMAIL;


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

    const amqpconn = await createAmqpConnection(amqpConfig);

    amqpconn.createConsumer(queues.confirmationRequest, async ({ content, ack, nack }) => {

        try {
            const user = content.user;

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

    amqpconn.createConsumer(queues.endscoreRequest, async ({ content, ack, nack }) => {

        try {
            const scores = content.scores_list;

            let html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>End Scores</title>
                </head>
                <body>
                    <h2>The competition has concluded, here are the results!</h2>
                    <ul>
            `;

            scores.forEach((score) => {
                html += `<li>${score.user_email}: ${score.score}</li>`;
            });

            html += `
                    </ul>
                    <p>Thank you for participating!</p>
                </body>
                </html>
            `;

            scores.forEach(async (score) => {
                const info = await transporter.sendMail({
                    from: '"Photo prestiges" <photos@example.com>',
                    to: score.user_email,
                    subject: "Competition ended!",
                    html: html,
                });
                console.log('Email sent:', info.messageId);
            });
            ack();
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
}

main();