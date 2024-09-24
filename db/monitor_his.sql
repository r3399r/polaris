create table monitor_his (
	id UUID not null default gen_random_uuid(),
	name string not null,
    row_count int not null,
	elapsed_time float not null,
	date_created TIMESTAMP NULL,
	PRIMARY KEY (id ASC),
	FOREIGN KEY (name) REFERENCES monitor (name)
);