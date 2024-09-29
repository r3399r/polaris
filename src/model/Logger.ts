export type LoggerInput = {
  project: string;
  resource: string;
  path: string;
  httpMethod: string;
  queryStringParameters: string | null;
  body: string | null;
  elapsedTime: number;
  statusCode: number;
  dateRequested: string;
};
