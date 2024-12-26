CREATE DOMAIN UUID AS VARCHAR(36);

CREATE TABLE "Images"(
    "id" UUID PRIMARY KEY,
    "avif" BYTEA,
    "webp" BYTEA,
    "width" SMALLINT,
    "height" SMALLINT,
    "uploadedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE "Videos"(
    "id" UUID PRIMARY KEY,
    "av1" UUID,
    "h265" UUID,
    "h264" UUID,
    "uploadedAt" TIMESTAMP DEFAULT NOW()
);

-- The structures as JSON of this table exmaple:
-- 144p = {"filePath": "D:\videos/a-av1.webm", "processedAt": "...", "size": 10000000}
-- 240p = {"filePath": "D:\videos/b-av1.webm", "processedAt": "...", "size": 20000000}
CREATE TABLE "VideoByResolutions"(
    "id" UUID PRIMARY KEY,
    "videoId" UUID,
    "144p" JSONB,
    "240p" JSONB,
    "480p" JSONB,
    "720p" JSONB,
    "1080p" JSONB,
    "1440p" JSONB,
    "2160p" JSONB,
    FOREIGN KEY ("videoId") REFERENCES "Videos"("id") ON DELETE CASCADE
)