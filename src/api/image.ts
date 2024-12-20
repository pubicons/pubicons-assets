import sharp from "sharp";
import { PG_CLIENT } from "..";
import { HTTPHandler, PathUtil } from "core";
import { UUID } from "core/src";
import { APIException } from "core/src/api";

enum ImageException {
    INVALID_UUID = "invalid_uuid"
}

export const IMAGE_HTTP_HANDLER = new HTTPHandler({
    post: async (request, response, buffer) => {
        const params = PathUtil.toUrl(request.url!).searchParams;
        const fit = params.get("fit") as keyof sharp.FitEnum;
        const width = params.get("width");
        const height = params.get("height");

        if (fit != null
         && fit != "contain"
         && fit != "cover"
         && fit != "fill"
         && fit != "inside"
         && fit != "outside") {
            response.writeHead(400);
            response.end(APIException.INVALID_REQUEST_FORMAT);
            return;
        }

        // The validation about the resize options for a given image.
        if (width && isNaN(parseInt(width)) || height && isNaN(parseInt(height))) {
            response.writeHead(400);
            response.end(APIException.INVALID_REQUEST_FORMAT);
            return;
        }

        let avif = sharp(buffer).toFormat("avif");
        let webp = sharp(buffer).toFormat("webp");
        const uuid = UUID.v4();

        // Settings resizing a given image to the given size options.
        const resizeOptions: sharp.ResizeOptions = {fit: fit ?? "cover"};
        if (width ) resizeOptions.width  = parseInt(width);
        if (height) resizeOptions.height = parseInt(height);
        if (width || height) {
            avif = avif.resize(resizeOptions);
            webp = webp.resize(resizeOptions);
        }

        await PG_CLIENT.query(`INSERT INTO "Images"("id", "avif", "webp") VALUES($1, $2, $3)`, [
            uuid,
            await avif.toBuffer(),
            await webp.toBuffer()
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
    },
    delete: async (request, response) => {
        const params = PathUtil.toUrl(request.url!).searchParams;
        const uuid = params.get("uuid");
        if (uuid) {
            const result = await PG_CLIENT.query(`DELETE FROM "Images" WHERE "id" = $1 RETURNING "id"`, [uuid]);
            
            if (result.rowCount == null
             || result.rowCount == 0) {
                response.writeHead(409);
                response.end(ImageException.INVALID_UUID);
                return;
            }

            response.writeHead(200);
            response.end();
        } else {
            response.writeHead(400);
            response.end(APIException.MISSING_REQUEST_FORMAT);
        }
    }
});