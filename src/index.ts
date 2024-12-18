import http from "http";
import { config } from "dotenv";
import { Client } from "pg";
import { createClient } from "redis";
import { HTTPRouter, PathUtil } from "core";
import { IMAGE_HTTP_HANDLER } from "./api/image";
import { HTTPConnection } from "core/src";

/** Initializes configuation values in node.js about .env files. */
config();

/** The value defines the currently active postgresql client instance. */
export const PG_CLIENT = new Client({
    port: Number.parseInt(process.env.POSTGRES_PORT as string),
    user: process.env.POSTGRES_USER,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD
});

/** The value defines the currently active redis client instance. */
export const REDIS_CLIENT = createClient({
    socket: {
        // Based on the external port (internal port is the default port of redis)
        port: Number.parseInt(process.env.REDIS_PORT as string)
    },
    password: process.env.REDIS_PASSWORD
});

http.createServer((request, response) => {
    if (!request.url) {
        response.writeHead(400);
        response.end();
        return;
    }

    const ROUTER = new HTTPRouter("image", IMAGE_HTTP_HANDLER);
    ROUTER.perform(new HTTPConnection(PathUtil.toList(request.url!), request, response))
})
.listen(8081, () => {
    PG_CLIENT.connect();
    REDIS_CLIENT.connect();
});