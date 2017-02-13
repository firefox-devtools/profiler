import fetchJsonP from 'fetch-jsonp';
import queryString from 'query-string';
import url from 'url';

export default function shortenURL(urlToShorten) {
  let longURL = urlToShorten;
  if (!longURL.startsWith('https://perf-html.io/')) {
    const parsedURL = url.parse(longURL);
    const parsedURLOnCanonicalHost = Object.assign({}, parsedURL, {
      protocol: 'https:',
      host: 'perf-html.io',
    });
    longURL = url.format(parsedURLOnCanonicalHost);
  }

  const bitlyQueryURL = 'https://api-ssl.bitly.com/v3/shorten?' +
    queryString.stringify({
      'longUrl': longURL,
      'domain': 'perfht.ml',
      'access_token': 'b177b00a130faf3ecda6960e8b59fde73e902422',
    });
  return fetchJsonP(bitlyQueryURL).then(response => response.json()).then(json => json.data.url);
}
