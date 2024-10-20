create table log_api (
	id UUID NOT NULL DEFAULT gen_random_uuid(),
    project STRING NOT NULL,
    resource STRING NOT NULL,
    path STRING NOT NULL,
    http_method STRING NOT NULL,
    query_string_param STRING NULL,
    body STRING NULL,
    status_code INT8 NOT NULL,
    elapsed_time INT8 NOT NULL,
    version STRING NULL,
	date_requested TIMESTAMP NOT NULL,
	date_created TIMESTAMP NOT NULL,
    PRIMARY KEY (id)
);