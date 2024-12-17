import http from "http";
import path from "path";
import { config } from "dotenv";
import { Client } from "pg";
import { createClient } from "redis";

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
    password: process.env.REDIS_PASSWORD
});

http.createServer((request, response) => {
    console.log(request.url);
})
.listen(8081);