const ffmpeg = require("fluent-ffmpeg");
const sharp = require("sharp");

export function handleJpegFile(filePath, res) {
    console.log("jpeg ==============");
    sharp(filePath)
        .resize({ width: 400 })
        .jpeg({ quality: 30 })
        .rotate()
        .toBuffer((err, data) => {
            if (err) {
                console.error("Error processing image:", err);
                return res.status(400).send("Error processing image");
            }

            res.set("Content-Type", "image/jpeg");
            res.send(data);
        });
}

export function handleMovFile(filePath, res) {
    const outputFilePath = filePath.replace(".mov", ".mp4");

    ffmpeg(filePath)
        .output(outputFilePath)
        .on("end", () => {
            res.set("Content-Type", "video/mp4");
            res.sendFile(outputFilePath);
        })
        .on("error", (err) => {
            console.error("Error converting video:", err);
            res.status(400).send("Error converting video");
        })
        .run();
}

export async function handleMovFileAsync(filePath, res) {
    const outputFilePath = filePath.replace(".mov", ".mp4");

    try {
        await new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .output(outputFilePath)
                .on("end", resolve)
                .on("error", reject)
                .run();
        });

        res.set("Content-Type", "video/mp4");
        res.sendFile(outputFilePath);
    } catch (err) {
        console.error("Error converting video:", err);
        res.status(400).send("Error converting video");
    }
}