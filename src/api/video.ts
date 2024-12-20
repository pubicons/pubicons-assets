import { HTTPHandler } from "core";
import { Readable } from "stream";
import * as ffmpeg from "fluent-ffmpeg";

function bufferToStream(buffer: Buffer) {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // Defines end of stream.
    return stream;
}

export const VIDEO_HTTP_HANDLER = new HTTPHandler({
    post: async (request, response, buffer) => {
        const command = new ffmpeg.FfmpegCommand({source: bufferToStream(buffer)});
        command.outputFormat("");
        command.on("end", (out, err) => {
            
        });
    }
});