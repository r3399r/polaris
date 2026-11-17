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

export type FunctionUrlEvent = {
  rawPath: string;
  requestContext: {
    http: {
      method: string;
    };
  };
  body?: string;
  isBase64Encoded?: boolean;
};

export type FunctionUrlResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};
