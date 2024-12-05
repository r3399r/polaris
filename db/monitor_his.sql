create table monitor_his (
	id UUID not null default gen_random_uuid(),
	name string not null,
    row_count int null,
	elapsed_time float null,
	success boolean null,
	date_created TIMESTAMP NULL,
	PRIMARY KEY (id ASC)
);