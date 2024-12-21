import { HTTPHandler } from "core";
import { PathUtil } from "core/src";
import { APIException } from "core/src/api";
import { REDIS_CLIENT } from "..";

enum VideoEncodeException {
    INVALID_UUID = "invalid_uuid"
}

export const VIDEO_ENCODE_HTTP_HANDLER = new HTTPHandler({
    get: async (request, response, _) => {
        const params = PathUtil.toUrl(request.url!).searchParams;
        const uuid = params.get("uuid");
        if (uuid) {
            const result = await REDIS_CLIENT.hGet("VideoProcessing", uuid);

            // The exception for validation about video UUID.
            if (result) {
                response.writeHead(200, {"content-type": "application/json"});
                response.end(result); // JSON String
            } else {
                response.writeHead(409);
                response.end(VideoEncodeException.INVALID_UUID);
            }
        } else {
            response.writeHead(400);
            response.end(APIException.MISSING_REQUEST_FORMAT);
        }
    }
});