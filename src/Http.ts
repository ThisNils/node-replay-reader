/* eslint-disable import/prefer-default-export */
import https from 'https';
import { URL } from 'url';

interface KeyValuePairs {
  [key: string]: any;
}

interface HttpResponse {
  data?: any;
  error?: any;
}

const accountQuery = `
query AccountQuery($accountIds: [String]!) {
  Account {
    accounts(accountIds: $accountIds) {
      id
      displayName
      externalAuths {
        externalDisplayName
      }
    }
  }
}
`;

const request = async (method: string, urlString: string, body?: any, headers?: KeyValuePairs): Promise<HttpResponse> => {
  const url = new URL(urlString);
  const rawBody = body && typeof body === 'object' ? JSON.stringify(body) : body.toString();
  const finalHeaders = headers || {};
  if (rawBody) finalHeaders['Content-Length'] = Buffer.byteLength(rawBody);
  if (typeof body === 'object' && !finalHeaders['Content-Type']) finalHeaders['Content-Type'] = 'application/json';

  const httpResponse: HttpResponse = await new Promise((res) => {
    const req = https.request({
      headers: finalHeaders,
      method,
      protocol: url.protocol,
      host: url.hostname,
      path: url.pathname,
      searchParams: url.searchParams,
      port: url.port,
    }, (response) => {
      let data = '';
      response.on('data', (d) => {
        data += d;
      });
      response.on('end', () => {
        try {
          data = JSON.parse(data);
        } catch (err) {
          // ignore JSON errors
        }

        if (!response.statusCode || response.statusCode < 200 || response.statusCode > 399) res({ error: data });
        else res({ data });
      });
    });

    req.once('error', (err) => res({ error: err }));

    if (rawBody) {
      req.end(rawBody);
    }
  });

  return httpResponse;
};

const queryAccounts = async (accountIds: string[]) => {
  const chunkedAccounts = accountIds.reduce((resArr: any[], id, i) => {
    const chunkIndex = Math.floor(i / 100);
    // eslint-disable-next-line no-param-reassign
    if (!resArr[chunkIndex]) resArr[chunkIndex] = [];
    resArr[chunkIndex].push(id);
    return resArr;
  }, []);

  const accounts = (await Promise.all(chunkedAccounts.map((accountChunk) => request('POST', 'https://graphql.epicgames.com/graphql', {
    operationName: 'query',
    variables: {
      accountIds: accountChunk,
    },
    query: accountQuery,
  })))).map((a) => a.data.data.Account.accounts).flat(1);

  return accounts;
};

export { request, queryAccounts };
