import sharp from "sharp";
import { PG_CLIENT } from "..";
import { HTTPHandler, HTTPUtil, PathUtil } from "core";
import { UUID } from "core/src";
import { APIException } from "core/src/api";
import { METHODS, ServerResponse } from "http";

interface ImageConstraint {
    maxWidth?: number;
    maxHeight?: number;
}

enum ImageException {
    INVALID_UUID = "invalid_uuid",
    INVALID_SIZE = "invalid_size"
}

export const IMAGE_HTTP_HANDLER = new HTTPHandler({
    post: async (request, response, buffer) => {
        const params = PathUtil.toUrl(request.url!).searchParams;
        const fit = params.get("fit") as keyof sharp.FitEnum;
        const width = params.get("width");
        const height = params.get("height");
        const constarint = HTTPUtil.parseRequest<ImageConstraint>(params.get("constraint") ?? "{}", response);
        if (!constarint) return;

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
        if (width  && isNaN(parseInt(width))
         || height && isNaN(parseInt(height))) {
            response.writeHead(400);
            response.end(APIException.INVALID_REQUEST_FORMAT);
            return;
        }

        // When the explicitly specified size is larger than
        // the maximum size defined by the given constraint.
        if (width  && parseInt(width)  > (constarint.maxWidth  ?? Infinity)
         || height && parseInt(height) > (constarint.maxHeight ?? Infinity)) {
            response.writeHead(400);
            response.end(ImageException.INVALID_SIZE);
            return;
        }

        let avif = sharp(buffer).toFormat("avif");
        let webp = sharp(buffer).toFormat("webp");
        const uuid = UUID.v4();
        const meta = await avif.metadata();
        const pWidth = width ? parseInt(width) : meta.width!;
        const pHeight = height ? parseInt(height) : meta.height!;
        const result = {
            uuid: uuid,
            width: Math.min(pWidth, constarint.maxWidth ?? Infinity),
            height: Math.min(pHeight, constarint.maxHeight ?? Infinity)
        }

        response.writeHead(200, {"content-type": "application/json"});
        response.end(JSON.stringify(result));

        // Settings resizing a given image to the given size options.
        const resizeOptions: sharp.ResizeOptions = {fit: fit ?? "cover"};
        resizeOptions.width = result.width;
        resizeOptions.height = result.height;
        if (width || height || constarint.maxWidth || constarint.maxHeight) {
            avif = avif.resize(resizeOptions);
            webp = webp.resize(resizeOptions);
        }

        PG_CLIENT.query(`INSERT INTO "Images"("id", "avif", "webp", "width", "height") VALUES($1, $2, $3, $4, $5)`, [
            uuid,
            await avif.toBuffer(),
            await webp.toBuffer(),
            result.width,
            result.height
        ]);
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