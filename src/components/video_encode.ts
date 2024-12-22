import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { REDIS_CLIENT } from "..";
import path from "path";

export interface VideoEncodeData {
    av1: {status: VideoEncodeStatus, progressPercent?: number},
    vp9: {status: VideoEncodeStatus, progressPercent?: number}
}

/** The video processing status about ffmpeg. */
export enum VideoEncodeStatus {
    READY = "ready",
    START = "start",
    PROGRESS = "progress",
    FINISHED = "finished"
}

export class VideoEncode {
    static initialize(uuid: string, buffer: Buffer): string {
        const originPath = path.join("db/videos/origin", `${uuid}.mp4`);
        fs.writeFileSync(originPath, buffer);
        return originPath;
    }

    static perform(uuid: string, data?: VideoEncodeData) {
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos/origin", {recursive: true});

        // Caches the status for a processing video initially.
        let encode: VideoEncodeData;
        REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(encode = data ?? {
            av1: {status: VideoEncodeStatus.READY},
            vp9: {status: VideoEncodeStatus.READY}
        }));

        const inputPath = `db/videos/origin/${uuid}.mp4`;

        // AV1 output (webm)
        const av1 = ffmpeg()
            .input(inputPath)
            .inputFormat("mp4")
            .output(`db/videos/${uuid}-av1.webm`)
            .videoCodec("libsvtav1")
            .addOptions(["-crf 35", "-preset 6"]);

        // VP9 output (webm)
        const vp9 = ffmpeg()
            .input(inputPath)
            .inputFormat("mp4")
            .output(`db/videos/${uuid}-vp9.mkv`)
            .videoCodec("libvpx-vp9")
            .addOptions(["-crf 35", "-speed 4"]);

        const setState = () => {
            REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(encode));
        }

        av1.ffprobe((error, video) => {
            av1.on("start", () => {
                encode.av1.status = VideoEncodeStatus.START;
                setState();
            });

            av1.on("end", () => {
                encode.av1.status = VideoEncodeStatus.FINISHED;
                delete encode.av1.progressPercent;
                setState();
            });

            av1.on("progress", (progress) => {
                encode.av1.status = VideoEncodeStatus.PROGRESS;
                encode.av1.progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                setState();
            });

            av1.run();
        });

        vp9.ffprobe((error, video) => {
            vp9.on("start", () => {
                encode.vp9.status = VideoEncodeStatus.START;
                setState();
            });

            vp9.on("end", () => {
                encode.vp9.status = VideoEncodeStatus.FINISHED;
                delete encode.vp9.progressPercent;
                setState();
            });

            vp9.on("progress", (progress) => {
                encode.vp9.status = VideoEncodeStatus.PROGRESS;
                encode.vp9.progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                setState();
            });

            vp9.run();
        });
    }
}