# Loading in profiles from various sources

Profiles can be loaded in perf.html from many different sources.

### Online Storage

> `https://perf-html.io/public/{HASH}`

Profiles can be stored in online data store. The hash is used to retrieve it. This is where profiles go when clicking the "Share..." button. Here is an example bash script to programmatically upload profiles:

```bash
uploadprofile() {
  gzip -c "$1" | curl 'https://profile-store.appspot.com/compressed-store' --compressed --data-binary @- | awk '{print "Hosted at: https://perf-html.io/public/"$1}'
}

# Execute with the following command:
uploadprofile /path/to/profile.js
```

### URL

> `https://perf-html.io/from-url/{URL}`

Profiles can also be loaded in from arbitrary URLs. In addition, you can then upload it to the online storage directly from perf.html's interface.

See the function below for an easy utility for converting to the proper URL format. Here is a simple utility function to turn a profile URL into a perf.html URL to view it:

```js
function getPerfHtmlUrl (profileUrl) {
  return `https://perf-html.io/from-url/${encodeURIComponent(profileUrl)}`;
}
```

### Add-on

> `https://perf-html.io/from-addon/`

The [Gecko Profiler Addon][Gecko Profiler Addon] injects the profile into the page through a frame script

### File

> `https://perf-html.io/from-file/`

When you're on [the home page](https://perf-html.io) files can be loaded by either dragging over the perf.html client, or using the file upload input.

[Gecko Profiler Addon]: https://github.com/devtools-html/Gecko-Profiler-Addon
