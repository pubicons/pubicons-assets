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

# Download FFmpeg
Must download the external dependency `FFmpeg`. And extract the downloaded archive and place the contents in a directory (e.g., C:\Program Files\ffmpeg). And add the C:\ffmpeg\bin directory to the Path system environment variable.

> Need to verify the setup by running ffmpeg -version in the command prompt.

| Type | URL |
| ---- | ------ |
| Link 1 | https://www.ffmpeg.org |
| Link 2 | https://github.com/BtbN/FFmpeg-Builds |

# Get Started
Enter the following commands in turn in the terminal.

- `npm install`: installing NPM packages.
- `npm run build`: installing git submodule.
- `npm run alive`: initialing about docker compose.
- `npm run watch` or `npm run start`