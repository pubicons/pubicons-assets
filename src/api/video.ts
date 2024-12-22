import { HTTPHandler, UUID } from "core";
import fs from "fs";
import { VideoEncode } from "../components/video_encode";

export const VIDEO_HTTP_HANDLER = new HTTPHandler({
    post: async (_, response, buffer) => {
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos/origin", {recursive: true});

        const uuid = UUID.v4();
        VideoEncode.initialize(uuid, buffer);
        VideoEncode.perform(uuid);

        response.writeHead(200);
        response.end(uuid);
    }
});