const { BlobServiceClient } = require("@azure/storage-blob");

async function createAzureStorage(config) {
    let blobServiceClient = null;
    let isExplicitlyClosed = false;
    let reconnectTimeout = null;

    async function connect() {
        if (isExplicitlyClosed) return;

        try {
            const client = BlobServiceClient.fromConnectionString(config.connectionString);
            blobServiceClient = client;

            // Verify connection by listing containers
            await client.listContainers().next();
            console.log("Connected to Azure Blob Storage");

            return client;
        } catch (error) {
            console.error("Connection error:", error.message);
            scheduleReconnect();
        }
    }

    function scheduleReconnect() {
        if (isExplicitlyClosed || !config.reconnect) return;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);

        reconnectTimeout = setTimeout(
            () => connect(),
            config.reconnectDelay || 5000
        );
    }

    async function ensureConnected() {
        while (!blobServiceClient && !isExplicitlyClosed) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async function uploadBlob(containerName, blobName, data, options = {}) {
        await ensureConnected();
        let retries = 0;

        while (retries < (config.maxRetries || 3)) {
            try {
                const containerClient = blobServiceClient.getContainerClient(containerName);
                await containerClient.createIfNotExists();

                const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                await blockBlobClient.uploadData(data, options);

                return {
                    success: true,
                    blobName,
                    container: containerName,
                    etag: blockBlobClient.etag
                };
            } catch (error) {
                if (retries >= (config.maxRetries || 3)) {
                    console.error(`Upload failed after ${retries} retries:`, error.message);
                    return {
                        success: false,
                        error: error.message,
                        blobName,
                        container: containerName
                    };
                }

                console.log(`Retrying upload (${retries + 1}/${config.maxRetries || 3})`);
                await new Promise(resolve => setTimeout(resolve, config.retryDelay || 1000));
                retries++;
            }
        }
    }

    async function downloadBlob(containerName, blobName) {
        await ensureConnected();

        try {
            const containerClient = blobServiceClient.getContainerClient(containerName);
            const blockBlobClient = containerClient.getBlockBlobClient(blobName);

            const downloadResponse = await blockBlobClient.download(0);
            const data = await streamToBuffer(downloadResponse.readableStreamBody);

            return {
                success: true,
                data,
                blobName,
                container: containerName,
                metadata: downloadResponse.metadata
            };
        } catch (error) {
            console.error("Download failed:", error.message);
            return {
                success: false,
                error: error.message,
                blobName,
                container: containerName
            };
        }
    }

    async function closeAll() {
        isExplicitlyClosed = true;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        blobServiceClient = null;
    }

    await connect();

    return {
        uploadBlob,
        downloadBlob,
        closeAll,
        getBlobServiceClient: () => blobServiceClient
    };
}

async function streamToBuffer(readableStream) {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

module.exports = {
    createAzureStorage
};