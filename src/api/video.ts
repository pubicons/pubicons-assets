import { HTTPHandler, UUID } from "core";
import { Readable } from "stream";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";

export const VIDEO_HTTP_HANDLER = new HTTPHandler({
    post: async (request, response, buffer) => {
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos", {recursive: true});

        const uuid = UUID.v4();
        const command = ffmpeg();
        command.input(Readable.from(buffer));
        command.inputFormat("mp4");
        command.output(`db/videos/${uuid}.webm`);
        command.outputFormat("webm");
        command.on("start", () => {
            console.log("Video Convertion Start");
        });

        command.on("progress", (progress) => {
            console.log(progress);
        });

        command.on("end", (out, err) => {
            console.log(out);
            console.log(err);
        });

        command.run();

        response.writeHead(200);
        response.end(uuid);
    }
});