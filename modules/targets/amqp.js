const amqp = require("amqplib");

async function createAmqpConnection(config){
    let connection;
    const channels = new Set();

    async function connect() {
        connection = await amqp.connect(config.url);
        connection.on('close', () => {
            console.log('Reinitializing connection...');
            setTimeout(connect, config.reconnectDelay || 5000);
        })
        return connection;
    }

    async function createManagedChannel() {
        const ch = await connection.createConfirmChannel();
        channels.add(ch);
        ch.on('close', () => channels.delete(ch));
        return ch;
    }

    async function closeAll() {
        for (const ch of channels) await ch.close();
        await connection.close();
    }

    async function close(channel) {
        channels.delete(channel);
        await channel.close();
    }

    await connect();

    return {
        createConsumer: async (queueConfig, handler) =>
            createQueueConsumer(createManagedChannel, close, queueConfig, handler),
        createProducer: async (queueConfig) =>
            createQueueProducer(createManagedChannel, close, queueConfig),
        closeAll: async () => closeAll,
    };
}

async function createQueueConsumer(createChannelFn, close, queueConfig, handler) {
    const channel = await createChannelFn(); // Use the manager's channel creation

    await channel.assertQueue(queueConfig.name, queueConfig.options);
    await channel.prefetch(queueConfig.prefetch || 10);

    const consumerTag = queueConfig.name.toString();

    channel.consume(queueConfig.name, async (msg) => {
        if (!msg) return;

        try {
            await handler({
                content: JSON.parse(msg.content.toString()),
                ack: () => channel.ack(msg),
                nack: (requeue = false) => channel.nack(msg, false, requeue),
            });
        } catch (error) {
            console.error(`Error in ${queueConfig.name} consumer:`, error);
            channel.nack(msg, false, queueConfig.requeueOnError);
        }
    }, { consumerTag });

    return {
        stop: async () => {
            await close(channel)
        },
        getChannel: () => channel
    };
}

async function createQueueProducer(createChannelFn, close, queueConfig) {
    const channel = await createChannelFn();

    if(queueConfig.name === null && queueConfig.options === null) {
        throw new Error("Should have correct queueconfig");
    }

    await channel.assertQueue(queueConfig.name, queueConfig.options);

    async function sendMessageToQueue(message, options = {}){
        try {
            let messageReturned = false;
            const handleReturn = () => {
                messageReturned = true;
            };
            channel.on('return', handleReturn);


            const serializedMessage = JSON.stringify(message);
            const messageBuffer = Buffer.from(serializedMessage);

            const messageHeaders = {
                ...(options.headers || {}),  // Preserve existing headers
                sentAt: new Date().toISOString()
            };

            const sendOptions = {
                persistent: true,
                ...options,
                headers: messageHeaders,
                mandatory: true,
            };

            const send = channel.sendToQueue(
                queueConfig.name,
                messageBuffer,
                sendOptions
            );

            if (!send) {
                throw new Error('Message failed to send');
            }

            await channel.waitForConfirms();

            if (messageReturned) {
                throw new Error('Message could not be send to the queue');
            }

            return {
                success: true,
                messageId: options.messageId
            };
        } catch (error) {
            console.error(`Failed to send message to ${queueConfig.name}:`, error);
            return {
                success: false,
                error: error,
                messageId: options.messageId,
                details: {
                    queue: queueConfig.name,
                    timestamp: new Date().toISOString()
                }
            };
        } finally {
            channel.removeListener('return', handleReturn);
        }
    }

    return {
        send: async (message, options = {}) => {
            sendMessageToQueue(message, options);
        },

        close: async () => {
            await close;
        },

        getChannel: () => channel
    };
}


module.exports = {
    createAmqpConnection
};