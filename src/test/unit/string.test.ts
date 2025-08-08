/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { removeURLs, removeFilePath } from '../../utils/string';

describe('utils/string', function () {
  describe('removeURLs', function () {
    it('should remove the basic URLs successfully', () => {
      let string = 'https://foo.com/';
      expect(removeURLs(string)).toEqual('https://<URL>');
      string = 'http://foo.com/';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'ftp://foo.com/';
      expect(removeURLs(string)).toEqual('ftp://<URL>');
      string = 'file://localhost/etc/fstab';
      expect(removeURLs(string)).toEqual('file://<URL>');
      string = 'file:///etc/fstab';
      expect(removeURLs(string)).toEqual('file://<URL>');
    });

    it('should remove the different kind of URLs successfully', () => {
      let string = 'http://foo.com/bar';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://foo.com/bar/';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://foo.com/bar/baz/hello/world/123';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://www.foo.com/bar/?baz=1234';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'https://www.example.com/foo/?bar=baz&inga=42&quux';
      expect(removeURLs(string)).toEqual('https://<URL>');
      string = 'http://userid@example.com/';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://userid:password@example.com/';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://userid:password@example.com:8080';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://142.42.1.1/';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://142.42.1.1:8080/';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://example.com/foo/#&bar=baz';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://foo.net/䨹';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://例子.测试';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://مثال.إختبار';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://उदाहरण.परीक्षा';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://1337.net';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://a.b-c.de';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'http://223.255.255.254';
      expect(removeURLs(string)).toEqual('http://<URL>');
      string = 'https://foo_bar.baz.com/';
      expect(removeURLs(string)).toEqual('https://<URL>');
      string = 'file://localhost/c$/WINDOWS/clock.avi';
      expect(removeURLs(string)).toEqual('file://<URL>');
      string = 'file:///c:/WINDOWS/clock.avi';
      expect(removeURLs(string)).toEqual('file://<URL>');
      string = 'file://192.168.1.50/~User/file.html';
      expect(removeURLs(string)).toEqual('file://<URL>');
    });

    it('should remove the URLs with texts around it successfully', () => {
      // URL with a text before it
      let string = 'Load 123: https://foo.com/';
      expect(removeURLs(string)).toEqual('Load 123: https://<URL>');

      // URL with a text after it
      string = 'https://foo.com/ bar baz';
      expect(removeURLs(string)).toEqual('https://<URL> bar baz');

      // URL with texts before and after it
      string = 'foo https://bar.com/ baz';
      expect(removeURLs(string)).toEqual('foo https://<URL> baz');
    });

    it('should remove the URL inside parentheses successfully', () => {
      const string = '(https://foo.com/)';
      expect(removeURLs(string)).toEqual('(https://<URL>)');
    });

    it('should remove the URL with file extension and multiple querystrings successfully', () => {
      const string =
        'https://px.image.com/test.gif?e=25&q=2&hp=1&kq=1&lo=1&ua=null&pk=1&wk=1&rk=1';
      expect(removeURLs(string)).toEqual('https://<URL>');
    });

    it('should remove the multiple URLs successfully', () => {
      let string = 'https://foo.com/ http://bar.com/';
      expect(removeURLs(string)).toEqual('https://<URL> http://<URL>');
      string = 'https://foo.com/ - http://bar.com - ftp://baz.com/';
      expect(removeURLs(string)).toEqual(
        'https://<URL> - http://<URL> - ftp://<URL>'
      );
      string =
        'https://www.example.com/foo/?bar=baz&inga=42&quux http://bar.com/';
      expect(removeURLs(string)).toEqual('https://<URL> http://<URL>');
    });

    it('should not remove non URLs', () => {
      let string = 'http://';
      expect(removeURLs(string)).toEqual(string);

      string = 'http://.';
      expect(removeURLs(string)).toEqual(string);

      string = 'http://../';
      expect(removeURLs(string)).toEqual(string);

      string = 'http://?';
      expect(removeURLs(string)).toEqual(string);

      string = '//';
      expect(removeURLs(string)).toEqual(string);

      string = 'foo.com';
      expect(removeURLs(string)).toEqual(string);
    });

    it('should not remove internal URLs', () => {
      let string = 'chrome://browser/content/browser.xul';
      expect(removeURLs(string)).toEqual(string);

      string = 'some-other-protocol://foo';
      expect(removeURLs(string)).toEqual(string);

      string = 'resource://gre/modules/NewTabUtils.jsm';
      expect(removeURLs(string)).toEqual(string);
    });

    it('should not remove basic about URLs', () => {
      let string = 'about:profiling';
      expect(removeURLs(string)).toEqual(string);

      string = 'about:config';
      expect(removeURLs(string)).toEqual(string);

      string = 'about:home';
      expect(removeURLs(string)).toEqual(string);

      string = 'Load: about:home';
      expect(removeURLs(string)).toEqual(string);
    });

    it('should remove the query strings of about URLs', () => {
      let string = 'about:config?u=foo=bar';
      expect(removeURLs(string)).toEqual('about:config?<sanitized>');

      string = 'about:home?u=https%3A//www.google.com/';
      expect(removeURLs(string)).toEqual('about:home?<sanitized>');

      string = 'about:profiling?foo=bar&u=https%3A//www.google.com/';
      expect(removeURLs(string)).toEqual('about:profiling?<sanitized>');

      string = 'about:profiling#foo-bar';
      expect(removeURLs(string)).toEqual('about:profiling#<sanitized>');

      string = 'about:profiling?foo=bar#baz';
      expect(removeURLs(string)).toEqual('about:profiling?<sanitized>');

      string = 'Load: about:home?foo=bar';
      expect(removeURLs(string)).toEqual('Load: about:home?<sanitized>');

      string = 'Load: about:home#foo-bar';
      expect(removeURLs(string)).toEqual('Load: about:home#<sanitized>');

      string = 'Load: about:home?foo=bar#baz';
      expect(removeURLs(string)).toEqual('Load: about:home?<sanitized>');

      string = 'about:config?u=foo=bar another text';
      expect(removeURLs(string)).toEqual(
        'about:config?<sanitized> another text'
      );

      string = 'about:profiling#foo-bar another text';
      expect(removeURLs(string)).toEqual(
        'about:profiling#<sanitized> another text'
      );

      string = 'Load: about:home?foo=bar#baz another text';
      expect(removeURLs(string)).toEqual(
        'Load: about:home?<sanitized> another text'
      );

      string = '(about:home?foo=bar#baz) another text';
      expect(removeURLs(string)).toEqual(
        '(about:home?<sanitized>) another text'
      );
    });

    it('should remove page URLs from moz-page-thumb URLs', () => {
      const string =
        'Image Load - moz-page-thumb://thumbnails/?url=https%3A%2F%2Fprofiler.firefox.com%2F';
      expect(removeURLs(string)).toEqual('Image Load - moz-page-thumb://<URL>');
    });

    it('should remove moz-extension URLs', () => {
      const string = 'moz-extension://foo/bar/index.js';
      expect(removeURLs(string)).toEqual('moz-extension://<URL>');
    });
  });

  describe('removeFilePath', function () {
    it('should remove Unix-like paths', () => {
      // A file in the root dir.
      let string = '/test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>/test.txt');
      // A file in a non-root dir.
      string = '/var/test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>/test.txt');
      // A file in the Linux home dir.
      string = 'home/username/test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>/test.txt');
      // A file in a Unix derived home dir.
      string = 'users/username/test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>/test.txt');
      // A file in another Unix derived home dir.
      string = 'user/username/test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>/test.txt');
      // A file in the macOS home dir.
      string = '/Users/username/test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>/test.txt');
      // A file path with spaces.
      string = '/path/with spaces in it/test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>/test.txt');
    });

    it('should remove windows paths', () => {
      // A file in the root dir.
      let string = `C:\\test.txt`;
      expect(removeFilePath(string)).toEqual('<PATH>\\test.txt');
      // A file in a non-root dir.
      string = 'C:\\Documents\\test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>\\test.txt');
      // A file in the Windows home dir.
      string = 'C:\\Users\\username\\test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>\\test.txt');
      // A file path with spaces.
      string = 'C:\\path\\with spaces in it\\test.txt';
      expect(removeFilePath(string)).toEqual('<PATH>\\test.txt');
    });

    it('should not remove non paths', () => {
      // It can be an empty string.
      let string = '';
      expect(removeFilePath(string)).toEqual(string);
      // Or less likely, something else
      string = 'not a path';
      expect(removeFilePath(string)).toEqual(string);
    });
  });
});
