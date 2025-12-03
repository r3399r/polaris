CREATE TABLE log_api (
    id INT UNSIGNED AUTO_INCREMENT,
    project VARCHAR(255) NOT NULL,
    resource VARCHAR(255) NOT NULL,
    path VARCHAR(255) NOT NULL,
    http_method VARCHAR(16) NOT NULL,
    query_string_param TEXT NULL,
    body TEXT NULL,
    status_code INT NOT NULL,
    elapsed_time INT NOT NULL,
    version VARCHAR(64) NULL,
    ip VARCHAR(64) NULL,
    date_requested DATETIME(3) NOT NULL,
    date_created DATETIME(3) NOT NULL,
    PRIMARY KEY (id)
);