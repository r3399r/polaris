CREATE TABLE ip (
    ip VARCHAR(64) NOT NULL,
    continent VARCHAR(255) NOT NULL,
    country VARCHAR(255) NOT NULL,
    region VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    mobile BOOLEAN NOT NULL,
    date_created DATETIME(3) NOT NULL,
    PRIMARY KEY (ip)
);