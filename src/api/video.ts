import { HTTPHandler, UUID } from "core";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { REDIS_CLIENT } from "..";
import path from "path";

interface VideoEncode {
    av1: {status: VideoEncodeStatus, progressPercent?: number},
    vp9: {status: VideoEncodeStatus, progressPercent?: number}
}

/** The video processing status about ffmpeg. */
enum VideoEncodeStatus {
    READY = "ready",
    START = "start",
    PROGRESS = "progress",
    FINISHED = "finished"
}

export const VIDEO_HTTP_HANDLER = new HTTPHandler({
    post: async (_, response, buffer) => {
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos/origin", {recursive: true});

        const uuid = UUID.v4();
        const temp = path.join("db/videos/origin", `${uuid}.mp4`);

        fs.writeFileSync(temp, buffer);

        // Caches the status for a processing video initially.
        let encode: VideoEncode;
        REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(encode = {
            av1: {status: VideoEncodeStatus.READY},
            vp9: {status: VideoEncodeStatus.READY}
        }));

        // AV1 output (webm)
        const av1 = ffmpeg()
            .input(temp)
            .inputFormat("mp4")
            .output(`db/videos/${uuid}-av1.webm`)
            .videoCodec("libsvtav1")
            .addOptions(["-crf 30", "-preset 2"]);

        // VP9 output (webm)
        const vp9 = ffmpeg()
            .input(temp)
            .inputFormat("mp4")
            .output(`db/videos/${uuid}-vp9.webm`)
            .videoCodec("libvpx-vp9")
            .addOptions(["-crf 30", "-speed 4"]);

        const setState = () => {
            REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(encode));
        }

        av1.ffprobe((error, video) => {
            av1.on("start", () => {encode.av1.status = VideoEncodeStatus.START; setState()});
            av1.on("end",   () => {encode.av1.status = VideoEncodeStatus.FINISHED; setState()});
            av1.on("progress", (progress) => {
                encode.av1.status = VideoEncodeStatus.PROGRESS;
                encode.av1.progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                setState();
            });
            av1.run();
        });

        vp9.ffprobe((error, video) => {
            vp9.on("start", () => {encode.vp9.status = VideoEncodeStatus.START; setState()});
            vp9.on("end",   () => {encode.vp9.status = VideoEncodeStatus.FINISHED; setState()});
            vp9.on("progress", (progress) => {
                encode.vp9.status = VideoEncodeStatus.PROGRESS;
                encode.vp9.progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                setState();
            });
            vp9.run();
        });

        response.writeHead(200);
        response.end(uuid);
    }
});