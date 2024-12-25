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

export interface VideoEncodeSetting {
    codecAlias: keyof VideoEncodeData;
    extension: "webm" | "mkv" | "mp4";
    codecName: string;
    options: string[]
}

/** The video processing status about ffmpeg. */
export enum VideoEncodeStatus {
    READY = "ready",
    START = "start",
    ERROR = "error",
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
    /**
     * The closer the value is to 1, the greater the reduction
     * in bitrate will be as the frame rate decreases.
    */
    static DECREASED_FACTOR = 0.75;

    static initialize(uuid: string, buffer: Buffer): string {
        const originPath = path.join("db/videos/origin", `${uuid}.mp4`);
        fs.writeFileSync(originPath, buffer);
        return originPath;
    }

    static encodeVideo(
        uuid: string,
        data: VideoEncodeData,
        setting: VideoEncodeSetting,
        metaData: {
            frameRate: number;
            resolution: VideoResolution;
            aspectRatio: number;
        }
    ): Promise<void> {
        const inputPath = `db/videos/origin/${uuid}.mp4`;
        const frameRate = metaData.frameRate;
        const resolution = metaData.resolution;
        const aspectRatio = metaData.aspectRatio;

        // The required directory settings.
        fs.mkdirSync("db/videos/origin", { recursive: true });
        fs.mkdirSync(`db/videos/queue/${uuid}`, { recursive: true });

        // The output video resolution pixels settings.
        const sizePixels = this.pixelsOf(metaData.resolution, aspectRatio);

        return this.processCodec(uuid, data, inputPath, resolution, sizePixels, frameRate, setting);
    }

    static pixelsOf(resolution: VideoResolution, aspectRatio: number): string {
        switch (resolution) {
            case VideoResolution._144p: return `256x${Math.max(128, Math.round(256 * aspectRatio))}`;
            case VideoResolution._240p: return `426x${Math.max(128, Math.round(426 * aspectRatio))}`;
            case VideoResolution._480p: return `854x${Math.max(128, Math.round(854 * aspectRatio))}`;
            case VideoResolution._720p: return `1280x${Math.max(128, Math.round(1280 * aspectRatio))}`;
            case VideoResolution._1080p: return `1920x${Math.max(128, Math.round(1920 * aspectRatio))}`;
            case VideoResolution._1440p: return `2560x${Math.max(128, Math.round(2560 * aspectRatio))}`;
            case VideoResolution._2160p: return `3840x${Math.max(128, Math.round(3840 * aspectRatio))}`;
            default: throw new Error("Unsupported resolution");
        }
    }

    static processCodec(
        uuid: string,
        data: VideoEncodeData,
        inputPath: string,
        resolution: VideoResolution,
        sizePixels: string,
        frameRate: number,
        setting: VideoEncodeSetting
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const bitrate = this.averageBitrateOf(resolution, frameRate);
            const codecName = setting.codecAlias;
            const outputPath = `db/videos/queue/${uuid}/${resolution}-${codecName}.${setting.extension}`;
            const ffmpegCommand = ffmpeg()
                .input(inputPath)
                .inputFormat("mp4")
                .output(outputPath)
                .setSize(sizePixels)
                .videoCodec(setting.codecName)
                .addOptions(setting.options)
                .addOptions(`-b:v ${bitrate}`);

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
                resolve();
            });

            ffmpegCommand.on("progress", (progress) => {
                if (data[codecName][resolution]) {
                    data[codecName][resolution].status = VideoEncodeStatus.PROGRESS;
                    data[codecName][resolution].progressPercent = (progress.percent ?? 0) / 100;
                    setState();
                }
            });

            ffmpegCommand.on("error", (error) => {
                if (data[codecName][resolution]) {
                    data[codecName][resolution].status = VideoEncodeStatus.ERROR;
                    setState();
                }
                reject(error);
            });

            ffmpegCommand.run();
        });
    }

    static codecInstanceOf(name: keyof VideoEncodeData): VideoEncodeSetting {
        switch (name) {
            case "av1": return {
                codecAlias: "av1",
                extension: "webm",
                codecName: process.env.AV1_ENCODER ?? "libsvtav1",
                options: ["-preset 6"]
            };
            case "h265": return {
                codecAlias: "h265",
                extension: "mp4",
                codecName: process.env.H265_ENCODER ?? "libx265",
                options: []
            };
            case "h264": return {
                codecAlias: "h264",
                extension: "mp4",
                codecName: process.env.H264_ENCODER ?? "libx264",
                options: []
            }
        }
    }

    static averageBitrateOf(resolution: VideoResolution, frameRate: number) {
        const bitrateMap = {
            [VideoResolution._144p]: parseInt(process.env.BITRATE_144P ?? "") || 300000, // 300kbps
            [VideoResolution._240p]: parseInt(process.env.BITRATE_240P ?? "") || 500000, // 500kbps
            [VideoResolution._480p]: parseInt(process.env.BITRATE_480P ?? "") || 1500000, // 1.5Mbps
            [VideoResolution._720p]: parseInt(process.env.BITRATE_720P ?? "") || 3000000, // 3.0Mbps
            [VideoResolution._1080p]: parseInt(process.env.BITRATE_1080P ?? "") || 6000000, // 6.0Mbps
            [VideoResolution._1440p]: parseInt(process.env.BITRATE_1440P ?? "") || 12000000, // 12.0Mbps
            [VideoResolution._2160p]: parseInt(process.env.BITRATE_2160P ?? "") || 25000000, // 25.0Mbps
        };

        // Calculate the scaling factor based on frame rate. (scaled to 60 FPS)
        const frameRateFactor = 1 - (1 - frameRate / 60) * this.DECREASED_FACTOR;

        // Return the adjusted bitrate based on the frame rate.
        return bitrateMap[resolution] * frameRateFactor;
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

        ffmpeg().input(`db/videos/origin/${uuid}.mp4`).ffprobe((_, video) => {
            const videoStream = video.streams.find(stream => stream.codec_type === "video");

            // Check the resolution of a given video by referring to stream.
            if (videoStream && videoStream.width && videoStream.height) {
                const frameRate = eval(videoStream.avg_frame_rate ?? "30") as number;
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
                    }
                }

                // Process video encoding sequentially by codec.
                for (const [codecName, resolutions] of Object.entries(encode)) {
                    const vCodec = this.codecInstanceOf(codecName as keyof VideoEncodeData);
                    const queues = Object.entries(resolutions as VideoEncodeData)
                        .filter(([_, data]) => data["status"] != VideoEncodeStatus.FINISHED)
                        .map(([key]) => key);

                    // Process video encoding sequentially by resolution as queue.
                    (async () => {
                        while (queues.length > 0) {
                            const resolution = queues.shift() as VideoResolution | undefined;
                            if (!resolution) return;

                            await this.encodeVideo(uuid, encode, vCodec, {
                                frameRate: frameRate,
                                resolution: resolution,
                                aspectRatio: aspectRatio,
                            });
                        }
                    })();
                }
            }
        });
    }
}