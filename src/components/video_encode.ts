import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import { REDIS_CLIENT } from "..";
import path from "path";

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
    av1: VideoEncodeResolutionQueues,
    vp9: VideoEncodeResolutionQueues
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
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos/origin", {recursive: true});
        fs.mkdirSync(`db/videos/queue/${uuid}`, {recursive: true});

        const inputPath = `db/videos/origin/${uuid}.mp4`;
        const resolution = size.resolution;
        const aspectRatio = size.aspectRatio;

        // AV1 output (webm)
        const av1 = ffmpeg()
            .input(inputPath)
            .inputFormat("mp4")
            .output(`db/videos/queue/${uuid}/${resolution}-av1.webm`)
            .videoCodec("libsvtav1")
            .addOptions(["-crf 35", "-preset 6"]);

        // VP9 output (webm)
        const vp9 = ffmpeg()
            .input(inputPath)
            .inputFormat("mp4")
            .output(`db/videos/queue/${uuid}/${resolution}-vp9.webm`)
            .videoCodec("libvpx-vp9")
            .addOptions(["-crf 35", "-speed 4"]);

        let sizePixels: string = "";
        switch (size.resolution) {
            case VideoResolution._144p: sizePixels = `256x${256 * aspectRatio}`; break;
            case VideoResolution._240p: sizePixels = `426x${426 * aspectRatio}`; break;
            case VideoResolution._480p: sizePixels = `854x${854 * aspectRatio}`; break;
            case VideoResolution._720p: sizePixels = `1280x${1280 * aspectRatio}`; break;
            case VideoResolution._1080p: sizePixels = `1920x${1920 * aspectRatio}`; break;
            case VideoResolution._1440p: sizePixels = `2560x${2560 * aspectRatio}`; break;
            case VideoResolution._2160p: sizePixels = `3840x${1280 * aspectRatio}`; break;
        }

        // The video resolution settings about the output results.
        av1.setSize(sizePixels);
        vp9.setSize(sizePixels);

        const setState = () => {
            REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(data));
        }

        av1.ffprobe((error, video) => {
            av1.on("start", () => {
                if (data.av1[resolution]) {
                    data.av1[resolution].status = VideoEncodeStatus.START;
                    setState();
                }
            });

            av1.on("end", () => {
                if (data.av1[resolution]) {
                    data.av1[resolution].status = VideoEncodeStatus.FINISHED;
                    delete data.av1[resolution].progressPercent;
                    setState();
                }
            });

            av1.on("progress", (progress) => {
                if (data.av1[resolution]) {
                    data.av1[resolution].status = VideoEncodeStatus.PROGRESS;
                    data.av1[resolution].progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                    setState();
                }
            });

            av1.run();
        });

        vp9.ffprobe((error, video) => {
            vp9.on("start", () => {
                if (data.vp9[resolution]) {
                    data.vp9[resolution].status = VideoEncodeStatus.START;
                    setState();
                }
            });

            vp9.on("end", () => {
                if (data.vp9[resolution]) {
                    data.vp9[resolution].status = VideoEncodeStatus.FINISHED;
                    delete data.vp9[resolution].progressPercent;
                    setState();
                }
            });

            vp9.on("progress", (progress) => {
                if (data.vp9[resolution]) {
                    data.vp9[resolution].status = VideoEncodeStatus.PROGRESS;
                    data.vp9[resolution].progressPercent = (progress.percent ?? 0) / 100; // 0 ~ 1
                    setState();
                }
            });

            vp9.run();
        });
    }

    static perform(uuid: string, data?: VideoEncodeData) {
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos/origin", {recursive: true});

        // Caches the status for a processing video initially.
        let encode: VideoEncodeData | undefined = data;
        REDIS_CLIENT.hSet("VideoProcessing", uuid, JSON.stringify(encode ??= {
            av1: {},
            vp9: {},
        }));

        ffmpeg().input(`db/videos/origin/${uuid}.mp4`).ffprobe((error, video) => {
            const videoStream = video.streams.find(stream => stream.codec_type === 'video');

            // Check the resolution of a given video by referring to stream.
            if (videoStream && videoStream.width && videoStream.height) {
                const aspectRatio = videoStream.height / videoStream.width;

                if (videoStream.width >= 256) {
                    encode.av1["144p"] = {status: VideoEncodeStatus.READY};
                    encode.vp9["144p"] = {status: VideoEncodeStatus.READY};
                    this.encodeVideo(uuid, encode, {resolution: VideoResolution._144p, aspectRatio});
                }

                if (videoStream.width >= 426) {
                    encode.av1["240p"] = {status: VideoEncodeStatus.READY};
                    encode.vp9["240p"] = {status: VideoEncodeStatus.READY};
                    this.encodeVideo(uuid, encode, {resolution: VideoResolution._240p, aspectRatio});
                }

                if (videoStream.width >= 854) {
                    encode.av1["480p"] = {status: VideoEncodeStatus.READY};
                    encode.vp9["480p"] = {status: VideoEncodeStatus.READY};
                    this.encodeVideo(uuid, encode, {resolution: VideoResolution._480p, aspectRatio});
                }

                if (videoStream.width >= 1280) {
                    encode.av1["720p"] = {status: VideoEncodeStatus.READY};
                    encode.vp9["720p"] = {status: VideoEncodeStatus.READY};
                    this.encodeVideo(uuid, encode, {resolution: VideoResolution._720p, aspectRatio});
                }

                if (videoStream.width >= 1920) {
                    encode.av1["1080p"] = {status: VideoEncodeStatus.READY};
                    encode.vp9["1080p"] = {status: VideoEncodeStatus.READY};
                    this.encodeVideo(uuid, encode, {resolution: VideoResolution._1080p, aspectRatio});
                }

                if (videoStream.width >= 2560) {
                    encode.av1["1440p"] = {status: VideoEncodeStatus.READY};
                    encode.vp9["1440p"] = {status: VideoEncodeStatus.READY};
                    this.encodeVideo(uuid, encode, {resolution: VideoResolution._1440p, aspectRatio});
                }

                if (videoStream.width >= 3840) {
                    encode.av1["2160p"] = {status: VideoEncodeStatus.READY};
                    encode.vp9["2160p"] = {status: VideoEncodeStatus.READY};
                    this.encodeVideo(uuid, encode, {resolution: VideoResolution._2160p, aspectRatio});
                }
            }
        });
    }
}