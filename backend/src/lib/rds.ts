import {
  DescribeDBInstancesCommand,
  RDSClient,
  StopDBInstanceCommand,
} from '@aws-sdk/client-rds';

let client: RDSClient | undefined;

const getClient = () => {
  if (client === undefined) client = new RDSClient({});

  return client;
};

export const describeDbInstance = async (identifier: string) => {
  const res = await getClient().send(
    new DescribeDBInstancesCommand({ DBInstanceIdentifier: identifier })
  );

  return res.DBInstances?.[0];
};

export const stopDbInstance = async (identifier: string) => {
  await getClient().send(
    new StopDBInstanceCommand({ DBInstanceIdentifier: identifier })
  );
};
