import sharp from "sharp";
import { PG_CLIENT } from "..";
import { HTTPHandler, PathUtil } from "core";
import { UUID } from "core/src";
import { APIException } from "core/src/api";

enum ImageException {
    INVALID_UUID = "invalid_uuid"
}

export const IMAGE_HTTP_HANDLER = new HTTPHandler({
    post: async (_, response, buffer) => {
        const avif = await sharp(buffer).toFormat("avif").toBuffer();
        const webp = await sharp(buffer).toFormat("webp").toBuffer();
        const uuid = UUID.v4();

        await PG_CLIENT.query(`INSERT INTO "Images"("id", "avif", "webp") VALUES($1, $2, $3)`, [
            uuid,
            avif,
            webp
        ]);

        response.writeHead(200);
        response.end(uuid);
    },
    get: async (request, response, _) => {
        const params = PathUtil.toUrl(request.url!).searchParams;
        const type = params.get("type") ?? "avif";
        const uuid = params.get("uuid");
        if (uuid) {
            if (type != "avif" && type != "webp") {
                response.writeHead(400);
                response.end(APIException.INVALID_REQUEST_FORMAT);
                return;
            }

            const isAvif = type == "avif";
            const result = isAvif
                ? await PG_CLIENT.query(`SELECT "avif" FROM "Images" WHERE "id" = $1 LIMIT 1`, [uuid])
                : await PG_CLIENT.query(`SELECT "webp" FROM "Images" WHERE "id" = $1 LIMIT 1`, [uuid]);

            if (result.rowCount == null
             || result.rowCount == 0) {
                response.writeHead(409);
                response.end(ImageException.INVALID_UUID);
                return;
            }

            response.setHeader("Content-Type", `image/${isAvif ? "avif" : "webp"}`);
            response.writeHead(200);
            response.end(result.rows[0][type == "avif" ? "avif" : "webp"]);
        } else {
            response.writeHead(400);
            response.end(APIException.MISSING_REQUEST_FORMAT);
        }
    }
});