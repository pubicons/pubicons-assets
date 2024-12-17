# Initial Settings
Create a `.env` file in the server/ folder and write the code according to the format below.

- In a single client (test environment), the ports of the assets(image, video) server must be different from those of the existing web server.

```env
POSTGRES_DB=pubicons
POSTGRES_PORT=5432
POSTGRES_USER=root
POSTGRES_PASSWORD=...

REDIS_PORT=6379
REDIS_PASSWORD=...{0}
```

And then, create a `redis.conf` file in the server/ folder and write the code according to the format below.

```conf
requirepass ...{0}
```