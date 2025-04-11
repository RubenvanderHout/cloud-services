require("dotenv").config();
const { BlobServiceClient } = require("@azure/storage-blob");


function createBlobService(config) {

    function initialize() {
        try {
            const blobServiceClient = BlobServiceClient.fromConnectionString(config.connectionString);
            console.log("Succesfully connected to BlobService")
            return blobServiceClient;
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    }

    return initialize();
}


async function createContainerClient(blobServiceClient, containerName, config) {

    let containerClient;

    async function initialize() {
        try {
            containerClient = blobServiceClient.getContainerClient(containerName);
             await containerClient.create(config);
        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    }

    async function uploadBlob(filename, data) {

        try {
            const blockBlobClient = containerClient.getBlockBlobClient(filename);
            const uploadBlobResponse = await blockBlobClient.upload(data);
            console.log(
                `Blob was uploaded successfully. requestId: ${uploadBlobResponse.requestId}`
            );
            return blockBlobClient.url;;

        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    }

    async function downloadBlob(filename) {

        try {
            const blockBlobClient = containerClient.getBlockBlobClient(filename);
            const downloadBlockBlobResponse = await blockBlobClient.download(0);
            return await streamToText(downloadBlockBlobResponse.readableStreamBody);

        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    }

    function listBlobs(containerClient) {
        try {
            const fileNames = [];
            for (const blob of containerClient.listBlobsFlat()) {
                fileNames.push(blob.name);
            }

            return fileNames;

        } catch (err) {
            console.log(`Error: ${err.message}`);
        }
    }

    await initialize();

    return {
        uploadBlob: uploadBlob,
        downloadBlob: downloadBlob,
        listBlobs: listBlobs,
    }
}

async function streamToText(readable) {

    try {
        readable.setEncoding('utf8');
        let data = '';
        for await (const chunk of readable) {
            data += chunk;
        }
        return data;

    } catch (err) {
        console.log(`Error: ${err.message}`);
    }
}

module.exports = {
    createBlobService,
    createContainerClient
}