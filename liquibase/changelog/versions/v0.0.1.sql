CREATE DOMAIN UUID AS VARCHAR(36);

CREATE TABLE "Images"(
    id UUID PRIMARY KEY,
    avif BYTEA,
    webp BYTEA,
    width SMALLINT,
    height SMALLINT,
    uploadedAt TIMESTAMP DEFAULT NOW()
);

CREATE TABLE "Videos"(
    id UUID PRIMARY KEY,
    av1 JSONB,
    h265 JSONB,
    h264 JSONB
);