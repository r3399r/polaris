export type QueueEvent = {
  Records: {
    messageId: string;
    receiptHandle: string;
    body: string;
    attributes: {
      ApproximateReceiveCount: string;
      SentTimestamp: string;
      SenderId: string;
      ApproximateFirstReceiveTimestamp: string;
    };
    messageAttributes: {};
    md5OfBody: string;
    eventSource: 'aws:sqs';
    eventSourceARN: string;
    awsRegion: string;
  }[];
};
