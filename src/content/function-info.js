/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Imported from the original cleopatra, needs to be double-checked.

const resources = {};
const meta = { addons: [] };

// If the function name starts with "non-virtual thunk to ", remove that part.
function cleanFunctionName(functionName) {
  const ignoredPrefix = 'non-virtual thunk to ';
  if (functionName.startsWith(ignoredPrefix)) {
    return functionName.substr(ignoredPrefix.length);
  }
  return functionName;
}

function addonWithID(addonID) {
  return meta.addons.find(function addonHasID(addon) {
    return addon.id.toLowerCase() === addonID.toLowerCase();
  });
}

function findAddonForChromeURIHost(host) {
  return meta.addons.find(function addonUsesChromeURIHost(addon) {
    return addon.chromeURIHosts && addon.chromeURIHosts.indexOf(host) !== -1;
  });
}

function ensureResource(name, resourceDescription) {
  if (!(name in resources)) {
    resources[name] = resourceDescription;
  }
  return name;
}

function resourceNameFromLibrary(library) {
  return ensureResource('lib_' + library, {
    type: 'library',
    name: library,
  });
}

function getAddonForScriptURI(url, host) {
  if (!meta || !meta.addons) {
    return null;
  }

  if (url.startsWith('resource:') && host.endsWith('-at-jetpack')) {
    // Assume this is a jetpack url
    const jetpackID = host.substring(0, host.length - 11) + '@jetpack';
    return addonWithID(jetpackID);
  }

  if (url.startsWith('file:///') && url.indexOf('/extensions/') !== -1) {
    const unpackedAddonNameMatch = /\/extensions\/(.*?)\//.exec(url);
    if (unpackedAddonNameMatch) {
      return addonWithID(decodeURIComponent(unpackedAddonNameMatch[1]));
    }
    return null;
  }

  if (url.startsWith('jar:file:///') && url.indexOf('/extensions/') !== -1) {
    const packedAddonNameMatch = /\/extensions\/(.*?).xpi/.exec(url);
    if (packedAddonNameMatch) {
      return addonWithID(decodeURIComponent(packedAddonNameMatch[1]));
    }
    return null;
  }

  if (url.startsWith('chrome://')) {
    const chromeURIMatch = /chrome:\/\/(.*?)\//.exec(url);
    if (chromeURIMatch) {
      return findAddonForChromeURIHost(chromeURIMatch[1]);
    }
    return null;
  }

  return null;
}

function resourceNameFromURI(url) {
  if (!url) {
    return ensureResource('unknown', {type: 'unknown', name: '<unknown>'});
  }

  const match = /^(.*):\/\/(.*?)\//.exec(url);

  if (!match) {
    // Can this happen? If so, we should change the regular expression above.
    return ensureResource('url_' + url, {type: 'url', name: url});
  }

  const [urlRoot, protocol, host] = match;

  const addon = getAddonForScriptURI(url, host);
  if (addon) {
    return ensureResource('addon_' + addon.id, {
      type: 'addon',
      name: addon.name,
      addonID: addon.id,
      icon: addon.iconURL,
    });
  }

  if (protocol.startsWith('http')) {
    return ensureResource('webhost_' + host, {
      type: 'webhost',
      name: host,
      icon: urlRoot + 'favicon.ico',
    });
  }

  return ensureResource('otherhost_' + host, {
    type: 'otherhost',
    name: host,
  });
}

// foo/bar/baz -> baz
// foo/bar/ -> bar/
// foo/ -> foo/
// foo -> foo
function getFilename(url) {
  const lastSlashPos = url.lastIndexOf('/', url.length - 2);
  return url.substr(lastSlashPos + 1);
}

// JS File information sometimes comes with multiple URIs which are chained
// with " -> ". We only want the last URI in this list.
function getRealScriptURI(url) {
  if (url) {
    const urls = url.split(' -> ');
    return urls[urls.length - 1];
  }
  return url;
}

/**
 * Get an object with information about the function.
 * @param  {string} fullName The function name
 * @return {object}          An object of the form:
 *                           {
 *                             functionName: string,
 *                             libraryName: string,
 *                             lineInformation: string,
 *                             isRoot: bool,
 *                             isJSFrame: bool
 *                           }
 *                           libraryName is a string index into the resources array at the top of this file.
 */
export function getFunctionInfo(fullName) {

  function getCPPFunctionInfo(fullName) {
    const match =
      /^(.*) \(in ([^)]*)\) (\+ [0-9]+)$/.exec(fullName) ||
      /^(.*) \(in ([^)]*)\) (\(.*:.*\))$/.exec(fullName) ||
      /^(.*) \(in ([^)]*)\)$/.exec(fullName);

    if (!match) {
      return null;
    }

    return {
      functionName: cleanFunctionName(match[1]),
      libraryName: resourceNameFromLibrary(match[2]),
      lineInformation: match[3] || '',
      isRoot: false,
      isJSFrame: false,
    };
  }

  function getJSFunctionInfo(fullName) {
    const jsMatch =
      /^(.*) \((.*):([0-9]+)\)$/.exec(fullName) ||
      /^()(.*):([0-9]+)$/.exec(fullName);

    if (!jsMatch) {
      return null;
    }

    const functionName = jsMatch[1] || '<Anonymous>';
    const scriptURI = getRealScriptURI(jsMatch[2]);
    const lineNumber = jsMatch[3];
    const scriptFile = getFilename(scriptURI);
    const resourceName = resourceNameFromURI(scriptURI);

    return {
      functionName: functionName + '() @ ' + scriptFile + ':' + lineNumber,
      libraryName: resourceName,
      lineInformation: '',
      isRoot: false,
      isJSFrame: true,
      scriptLocation: {
        scriptURI: scriptURI,
        lineInformation: lineNumber,
      },
    };
  }

  function getFallbackFunctionInfo(fullName) {
    return {
      functionName: cleanFunctionName(fullName),
      libraryName: '',
      lineInformation: '',
      isRoot: fullName === '(root)',
      isJSFrame: false,
    };
  }

  return getCPPFunctionInfo(fullName) ||
         getJSFunctionInfo(fullName) ||
         getFallbackFunctionInfo(fullName);
}
