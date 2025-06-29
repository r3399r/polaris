import 'dotenv/config';
import { CockroachDataSource, LogApiEntity as CockroachLogApiEntity } from "./dataAccess/CockroachDataSource";
import { MySqlDataSource, LogApiEntity as MySqlLogApiEntity } from "./dataAccess/MySqlDataSource";

async function main() {
    await MySqlDataSource.initialize();
    await CockroachDataSource.initialize();

    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;
    try {
        while (hasMore) {
            // Fetch a batch from MySQL
            const logs = await CockroachDataSource.getRepository(CockroachLogApiEntity)
                .createQueryBuilder("log")
                .orderBy("log.id") // Make sure to order by a unique column
                .skip(offset)
                .take(batchSize)
                .getMany();
            if (logs.length === 0) {
                hasMore = false;
                break;
            }

            // Insert batch into CockroachDB
            await MySqlDataSource.getRepository(MySqlLogApiEntity).save(logs);

            offset += logs.length;
            console.log(`Migrated ${offset} records...`);
        }
        console.log("Migration complete.");
    } finally {
        await MySqlDataSource.destroy();
        await CockroachDataSource.destroy();
    }
}

main().catch((err) => {
    console.error("Error during TypeORM operation:", err);
});
