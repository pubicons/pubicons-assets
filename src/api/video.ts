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

        // AV1 output (mkv)
        const av1 = ffmpeg();
        av1.input(temp);
        av1.inputFormat("mp4");
        av1.output(`db/videos/${uuid}-av1.mkv`);
        av1.videoCodec("libaom-av1");

        // VP9 output (avi)
        const vp9 = ffmpeg();
        vp9.input(temp);
        vp9.inputFormat("mp4");
        vp9.output(`db/videos/${uuid}-vp9.avi`);
        vp9.videoCodec("libx264");

        const setState = () => {
            REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(encode));
        }

        av1.ffprobe((error, video) => {
            av1.on("start", () => {encode.av1.status = VideoEncodeStatus.START; setState()});
            av1.on("end",   () => {encode.av1.status = VideoEncodeStatus.FINISHED; setState()});
            av1.on("progress", (progress) => {
                encode.av1.progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                setState();
            });
            av1.run();
        });

        vp9.ffprobe((error, video) => {
            vp9.on("start", () => {encode.vp9.status = VideoEncodeStatus.START; setState()});
            vp9.on("end",   () => {encode.vp9.status = VideoEncodeStatus.FINISHED; setState()});
            vp9.on("progress", (progress) => {
                encode.vp9.progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                setState();
            });
            vp9.run();
        })

        response.writeHead(200);
        response.end(uuid);
    }
});