require("dotenv").config();
const nodemailer = require('nodemailer');
const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const EMAIL_HOST = process.env.EMAIL_HOST
const EMAIL_PORT = process.env.EMAIL_PORT

const QUEUE_CONFIRMATION_REQUEST = process.env.QUEUE_CONFIRMATION_REQUEST;
const QUEUE_CONFIRMATION_RESPONSE = process.env.QUEUE_CONFIRMATION_RESPONSE;
const QUEUE_ENDSCORE_REQUEST = process.env.QUEUE_ENDSCORE_REQUEST;

// Create Mailhog transporter (no authentication needed)
const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    ignoreTLS: true
});

const queues = {
    confirmationRequest: {
        name: QUEUE_CONFIRMATION_REQUEST,
    },
    confirmationResponse: {
        name: QUEUE_CONFIRMATION_RESPONSE,
    },
    endscoreRequest: {
        name: QUEUE_ENDSCORE_REQUEST
    },

};

async function main() {
    const app = express();

    app.use(express.json());

    const amqpconn = await createAmqpConnection(amqpConfig);

    amqpconn.createConsumer(queues.confirmationRequest, async ({ content, ack, nack }) => {

        try {
            const token = jwt.sign({ username: content.username, email: content.email }, JWT_SECRET);

            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Email Confirmation</title>
                </head>
                <body>
                    <h2>Confirm Your Email</h2>
                    <p>Hello, please confirm your email by clicking the button below:</p>
                    <button><a href="http://localhost:7000/confirm/${token}">Confirm Email</a></button>
                </body>
                </html>
            `;

            const info = await transporter.sendMail({
                from: '"Photo prestiges" <photos@example.com>',
                to: user.email,
                subject: "Confirm email",
                html: html,
            });
            ack();
            console.log('Email sent:', info.messageId);
        } catch (error) {
            nack();
            console.error('Error sending email:', error);
        }
    });

    const confirmationResponse = await amqpconn.createProducer(queues.confirmationResponse);

    app.get('/confirm/:token', async (req, res) => {

        const token = req.params.token

        if (token === null) {
            return res.status(400).send('Empty value for token');
        }

        jwt.verify(token, JWT_SECRET, (err, user) => {
            if (err) {
                console.error('JWT verification failed:', err);
                return res.status(401).send('Unauthorized');
            }

            transporter.sendMail({
                from: '"Photo prestiges" <photos@example.com>',
                to: user.email,
                subject: "Email confirmed",
                text: "Email confirmed",
            });

            confirmationResponse.send(user);
            return res.send('Confirmation received');
        });
    })

    app.listen(port, host, () => {
        console.info(`Started server on port ${port}`);
    });
}

main();