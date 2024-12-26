import { HTTPHandler, UUID } from "core";
import fs from "fs";
import { VideoEncode } from "../components/video_encode";
import { PG_CLIENT } from "..";

export const VIDEO_HTTP_HANDLER = new HTTPHandler({
    post: async (_, response, buffer) => {
        // Make directory for saving temp video files.
        fs.mkdirSync("db/videos/origin", {recursive: true});

        const uuid = UUID.v4();
        const av01UUID = UUID.v4();
        const h264UUID = UUID.v4();
        const h265UUID = UUID.v4();

        try {
            await PG_CLIENT.query(`START TRANSACTION`);
            await PG_CLIENT.query(`INSERT INTO "Videos" VALUES($1, $2, $3, $4)`, [uuid, av01UUID, h265UUID, h264UUID]);
            await PG_CLIENT.query(`INSERT INTO "VideoByResolutions" VALUES($1, $2)`, [av01UUID, uuid]);
            await PG_CLIENT.query(`INSERT INTO "VideoByResolutions" VALUES($1, $2)`, [h265UUID, uuid]);
            await PG_CLIENT.query(`INSERT INTO "VideoByResolutions" VALUES($1, $2)`, [h264UUID, uuid]);
            await PG_CLIENT.query(`COMMIT`);
        } catch (error) {
            await PG_CLIENT.query("ROLLBACK");
            throw error;
        }

        VideoEncode.initialize(uuid, buffer);
        VideoEncode.perform(uuid);

        response.writeHead(200);
        response.end(uuid);
    }
});