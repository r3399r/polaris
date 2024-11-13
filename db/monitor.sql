create table monitor (
	name string not null,
	sql string not null,
	refresh_period int8 not null,
	append bool not null,
	primary key (name)
);