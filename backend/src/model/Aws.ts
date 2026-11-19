/**
 * The SQS event the `logger` handler receives. There is no ApiEvent here any
 * more: the http api goes through hono/aws-lambda, which brings its own
 * typing of API Gateway's payload.
 */
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
