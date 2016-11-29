import fetchJsonP from 'fetch-jsonp';
import queryString from 'query-string';

export function shortenCleopatraUrl(longUrl) {
  const bitlyQueryUrl = 'https://api-ssl.bitly.com/v3/shorten?' +
    queryString.stringify({
      longUrl,
      domain: 'clptr.io',
      access_token: 'd51e4336df90de42b466d731f7534c2e5eaad3bc',
    });
  return fetchJsonP(bitlyQueryUrl).then(response => response.json()).then(json => json.data.url);
}
