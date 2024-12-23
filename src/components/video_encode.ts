import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import { REDIS_CLIENT } from "..";

export type VideoEncodeQueueStatus = {status: VideoEncodeStatus, progressPercent?: number};
export type VideoEncodeResolutionQueues = {
    "144p" ?: VideoEncodeQueueStatus;
    "240p" ?: VideoEncodeQueueStatus;
    "480p" ?: VideoEncodeQueueStatus;
    "720p" ?: VideoEncodeQueueStatus;
    "1080p"?: VideoEncodeQueueStatus;
    "1440p"?: VideoEncodeQueueStatus;
    "2160p"?: VideoEncodeQueueStatus;
}

export interface VideoEncodeData {
    av1: VideoEncodeResolutionQueues;
    h265: VideoEncodeResolutionQueues;
    h264: VideoEncodeResolutionQueues;
}

export interface VideoEncodeCodec {
    name: keyof VideoEncodeData;
    extension: "webm" | "mkv" | "mp4";
    codec: string;
    options: string[]
}

/** The video processing status about ffmpeg. */
export enum VideoEncodeStatus {
    READY = "ready",
    START = "start",
    PROGRESS = "progress",
    FINISHED = "finished"
}

export enum VideoResolution {
    _144p = "144p",
    _240p = "240p",
    _480p = "480p",
    _720p = "720p",
    _1080p = "1080p",
    _1440p = "1440p",
    _2160p = "2160p"
}

export class VideoEncode {
    static initialize(uuid: string, buffer: Buffer): string {
        const originPath = path.join("db/videos/origin", `${uuid}.mp4`);
        fs.writeFileSync(originPath, buffer);
        return originPath;
    }

    static encodeVideo(
        uuid: string,
        data: VideoEncodeData,
        size: {
            resolution: VideoResolution,
            aspectRatio: number
        }
    ) {
        const inputPath = `db/videos/origin/${uuid}.mp4`;
        const resolution = size.resolution;
        const aspectRatio = size.aspectRatio;

        // The required directory settings.
        fs.mkdirSync("db/videos/origin", { recursive: true });
        fs.mkdirSync(`db/videos/queue/${uuid}`, { recursive: true });

        // The output video resolution pixels settings.
        const sizePixels = this.pixelsOf(size.resolution, aspectRatio);

        // The video codec list to be processed.
        const codecs: VideoEncodeCodec[] = [];
        const av1Status = data.av1[resolution]?.status;
        const h265Status = data.h265[resolution]?.status;
        const h264Status = data.h264[resolution]?.status;

        // About AV1
        if (av1Status != VideoEncodeStatus.FINISHED) {
            codecs.push({
                name: "av1",
                extension: "webm",
                codec: process.env.AV1_ENCODER ?? "libsvtav1",
                options: ["-crf 35", "-preset 6"]
            });
        }

        // About H.265
        if (h265Status != VideoEncodeStatus.FINISHED) {
            codecs.push({
                name: "h265",
                extension: "mp4",
                codec: process.env.H265_ENCODER ?? "libx265",
                options: ["-crf 35", "-speed 4"]
            });
        }

        // About H.264
        if (h264Status != VideoEncodeStatus.FINISHED) {
            codecs.push({
                name: "h264",
                extension: "mp4",
                codec: process.env.H264_ENCODER ?? "libx264",
                options: ["-crf 28", "-speed 4"]
            });
        }

        codecs.forEach((codec: VideoEncodeCodec) => {
            this.processCodec(uuid, data, inputPath, resolution, sizePixels, codec);
        });
    }

    static pixelsOf(resolution: VideoResolution, aspectRatio: number): string {
        switch (resolution) {
            case VideoResolution._144p: return `256x${Math.round(256 * aspectRatio)}`;
            case VideoResolution._240p: return `426x${Math.round(426 * aspectRatio)}`;
            case VideoResolution._480p: return `854x${Math.round(854 * aspectRatio)}`;
            case VideoResolution._720p: return `1280x${Math.round(1280 * aspectRatio)}`;
            case VideoResolution._1080p: return `1920x${Math.round(1920 * aspectRatio)}`;
            case VideoResolution._1440p: return `2560x${Math.round(2560 * aspectRatio)}`;
            case VideoResolution._2160p: return `3840x${Math.round(3840 * aspectRatio)}`;
            default: throw new Error("Unsupported resolution");
        }
    }

    static processCodec(
        uuid: string,
        data: VideoEncodeData,
        inputPath: string,
        resolution: VideoResolution,
        sizePixels: string,
        codec: VideoEncodeCodec
    ) {
        const codecName = codec.name;
        const outputPath = `db/videos/queue/${uuid}/${resolution}-${codecName}.${codec.extension}`;
        const ffmpegCommand = ffmpeg()
            .input(inputPath)
            .inputFormat("mp4")
            .output(outputPath)
            .videoCodec(codec.codec)
            .addOptions(codec.options)
            .setSize(sizePixels);

        const setState = () => {
            REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(data));
        };

        ffmpegCommand.on("start", () => {
            if (data[codecName][resolution]) {
                data[codecName][resolution].status = VideoEncodeStatus.START;
                setState();
            }
        });

        ffmpegCommand.on("end", () => {
            if (data[codecName][resolution]) {
                data[codecName][resolution].status = VideoEncodeStatus.FINISHED;
                delete data[codecName][resolution].progressPercent;
                setState();
            }
        });

        ffmpegCommand.on("progress", (progress) => {
            if (data[codecName][resolution]) {
                data[codecName][resolution].status = VideoEncodeStatus.PROGRESS;
                data[codecName][resolution].progressPercent = (progress.percent ?? 0) / 100;
                setState();
            }
        });

        ffmpegCommand.run();
    }

    static perform(uuid: string, data?: VideoEncodeData) {
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos/origin", {recursive: true});

        // Caches the status for a processing video initially.
        let encode: VideoEncodeData | undefined = data;
        REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(encode ??= {
            av1: {},
            h265: {},
            h264: {},
        }));

        ffmpeg().input(`db/videos/origin/${uuid}.mp4`).ffprobe((error, video) => {
            const videoStream = video.streams.find(stream => stream.codec_type === "video");

            // Check the resolution of a given video by referring to stream.
            if (videoStream && videoStream.width && videoStream.height) {
                const aspectRatio = videoStream.height / videoStream.width;
                const resolutions: [VideoResolution, number][] = [
                    [VideoResolution._144p, 256],
                    [VideoResolution._240p, 426],
                    [VideoResolution._480p, 854],
                    [VideoResolution._720p, 1280],
                    [VideoResolution._1080p, 1920],
                    [VideoResolution._1440p, 2560],
                    [VideoResolution._2160p, 3840],
                ];

                // Encoding by the resolutions(e.g. 144p ~ 2160p)
                for (const [resolution, minWidth] of resolutions) {
                    if (videoStream.width >= minWidth) {
                        encode.av1[resolution] ??= {status: VideoEncodeStatus.READY};
                        encode.h265[resolution] ??= {status: VideoEncodeStatus.READY};
                        encode.h264[resolution] ??= {status: VideoEncodeStatus.READY};
                        this.encodeVideo(uuid, encode, {resolution, aspectRatio});
                    }
                }
            }
        });
    }
}