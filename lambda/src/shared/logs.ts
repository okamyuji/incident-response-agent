import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
} from '@aws-sdk/client-cloudwatch-logs';

export interface LogSample {
  logId: string;
  timestamp: string;
  message: string;
}

export interface LogFetcher {
  fetchRecent(params: {
    logGroupName: string;
    minutes: number;
    limit: number;
  }): Promise<LogSample[]>;
}

export class CloudWatchLogFetcher implements LogFetcher {
  private readonly client: CloudWatchLogsClient;

  constructor(client?: CloudWatchLogsClient) {
    this.client = client ?? new CloudWatchLogsClient({});
  }

  async fetchRecent(params: {
    logGroupName: string;
    minutes: number;
    limit: number;
  }): Promise<LogSample[]> {
    const endTime = Math.floor(Date.now() / 1000);
    const startTime = endTime - params.minutes * 60;

    const startResp = await this.client.send(
      new StartQueryCommand({
        logGroupName: params.logGroupName,
        startTime,
        endTime,
        queryString: `fields @timestamp, @message, @logStream | filter level = "error" or level = "warn" | sort @timestamp desc | limit ${params.limit}`,
      }),
    );

    const queryId = startResp.queryId;
    if (!queryId) return [];

    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      await sleep(500);
      const r = await this.client.send(new GetQueryResultsCommand({ queryId }));
      if (r.status === 'Complete' || r.status === 'Failed' || r.status === 'Cancelled') {
        return (r.results ?? []).map((fields, idx) => ({
          logId: findField(fields, '@ptr') ?? `ptr-${idx}`,
          timestamp: findField(fields, '@timestamp') ?? '',
          message: findField(fields, '@message') ?? '',
        }));
      }
    }
    return [];
  }
}

function findField(fields: { field?: string; value?: string }[], name: string): string | undefined {
  return fields.find((f) => f.field === name)?.value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
