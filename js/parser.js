Array.prototype.clone = function() { return this.slice(0); }

function Sample(name, extraInfo, line) {
  this.frames = [name];
  this.extraInfo = extraInfo;
  this.lines = [];
  this.clone = function() {
    var cpy = new Sample("", extraInfo, null);
    cpy.frames = this.frames.clone();
    cpy.lines = this.lines.clone();
    return cpy;
  }
}

function TreeNode(name, parent) {
  this.name = name;
  this.children = [];
  this.counter = 1;
  this.parent = parent;
}
TreeNode.prototype.traverse = function TreeNode_traverse(callback) {
  if (this.children.length == 0) {
    return false;
  }
  for (var i = 0; i < this.children.length; ++i) {
    var child = this.children[i];
    var result = callback(child);
    if (result !== false) {
      return result;
    }
  }
  return false;
};
TreeNode.prototype.getDepth = function TreeNode__getDepth() {
  if (this.parent)
    return this.parent.getDepth() + 1;
  return 0;
};
TreeNode.prototype.findChild = function TreeNode_findChild(name) {
  for (var i = 0; i < this.children.length; i++) {
    var child = this.children[i];
    if (child.name == name)
      return child;
  }
  return null;
}
// path is an array of strings which is matched to our nodes' names.
// Try to walk path in our own tree and return the last matching node. The
// length of the match can be calculated by the caller by comparing the
// returned node's depth with the depth of the path's start node.
TreeNode.prototype.followPath = function TreeNode_followPath(path) {
  if (path.length == 0)
    return this;

  var matchingChild = this.findChild(path[0]);
  if (!matchingChild)
    return this;

  return matchingChild.followPath(path.slice(1));
};
TreeNode.prototype.incrementCountersInParentChain = function TreeNode_incrementCountersInParentChain() {
  this.counter++;
  if (this.parent)
    this.parent.incrementCountersInParentChain();
};

var Parser = {
  parse: function Parser_parse(data) {
    var lines = data.split("\n");
    var extraInfo = {};
    var symbols = [];
    var symbolIndices = {};
    var functions = [];
    var functionIndices = {};

    function indexForFunction(functionName, libraryName) {
      if (functionName in functionIndices)
        return functionIndices[functionName];
      var newIndex = functions.length;
      functions[newIndex] = {
        functionName: functionName,
        libraryName: libraryName
      };
      functionIndices[functionName] = newIndex;
      return newIndex;
    }

    function parseSymbol(symbol) {
      var info = Parser.getFunctionInfo(symbol);
      return {
        symbolName: symbol,
        functionIndex: indexForFunction(info.functionName, info.libraryName),
        lineInformation: info.lineInformation
      };
    }

    function indexForSymbol(symbol) {
      if (symbol in symbolIndices)
        return symbolIndices[symbol];
      var newIndex = symbols.length;
      symbols[newIndex] = parseSymbol(symbol);
      symbolIndices[symbol] = newIndex;
      return newIndex;
    }

    var samples = [];
    var sample = null;
    for (var i = 0; i < lines.length; ++i) {
      var line = lines[i];
      if (line.length < 2 || line[1] != '-') {
        // invalid line, ignore it
        continue;
      }
      var info = line.substring(2);
      switch (line[0]) {
      //case 'l':
      //  // leaf name
      //  if ("leafName" in extraInfo) {
      //    extraInfo.leafName += ":" + info;
      //  } else {
      //    extraInfo.leafName = info;
      //  }
      //  break;
      case 'm':
        // marker
        if (!("marker" in extraInfo)) {
          extraInfo.marker = [];
        }
        extraInfo.marker.push(info);
        break;
      case 's':
        // sample
        var sampleName = info;
        sample = new Sample(sampleName, extraInfo);
        samples.push(sample);
        extraInfo = {}; // reset the extra info for future rounds
        break;
      case 'c':
      case 'l':
        // continue sample
        if (sample) { // ignore the case where we see a 'c' before an 's'
          sample.frames.push(indexForSymbol(info));
        }
        break;
      case 'r':
        // responsiveness
        if (sample) {
          sample.extraInfo["responsiveness"] = parseFloat(info);
        }
        break;
      }
      if (sample != null)
        sample.lines.push(line);
    }
    return { symbols: symbols, functions: functions, samples: samples};
  },

  _cleanFunctionName: function Parser__cleanFunctionName(functionName) {
    var ignoredPrefix = "non-virtual thunk to ";
    if (functionName.substr(0, ignoredPrefix.length) == ignoredPrefix)
      return functionName.substr(ignoredPrefix.length);
    return functionName;
  },

  filterByJank: function Parser_filterByJank(profile, filterThreshold) {
    var samples = profile.samples.clone();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      if (sample.extraInfo["responsiveness"] < filterThreshold) {
        samples[i] = samples[i].clone();
        samples[i].frames = ["Filtered out"];
      }
    }
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterBySymbol: function Parser_filterBySymbol(profile, symbol, invertCallstack) {
    var samples = profile.samples.clone();
    symbol = symbol.toLowerCase();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      samples[i] = samples[i].clone();
      samples[i].frames = samples[i].frames.clone();
      if (invertCallstack) {
        samples[i].frames = samples[i].frames.reverse();
      }
      while (samples[i].frames.length > 0) {
        if (profile.symbols[samples[i].frames[0]] != null) {
          var currSymbol = profile.functions[profile.symbols[samples[i].frames[0]].functionIndex].functionName;
          currSymbol = currSymbol.toLowerCase();
          if (symbol == currSymbol) {
            if (invertCallstack) {
              samples[i].frames.pop(); // remove root from the bottom
              samples[i].frames = samples[i].frames.reverse();
            } else {
              samples[i].frames = ["(root)"].concat(samples[i].frames);
            }
            continue calltrace_it; // Stop trimming this callstack
          }
        }
        samples[i].frames.shift();
      }
      samples[i].frames = ["(root)"];
    }
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterByName: function Parser_filterByName(profile, filterName) {
    var samples = profile.samples.clone();
    filterName = filterName.toLowerCase();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      var callstack = sample.frames;
      for (var j = 0; j < callstack.length; ++j) { 
        var symbol = profile.symbols[callstack[j]];
        if (symbol != null &&
            profile.functions[callstack[j]].symbolName.toLowerCase().indexOf(filterName) != -1) {
          continue calltrace_it;
        }
      }
      samples[i] = samples[i].clone();
      samples[i].frames = ["Filtered out"];
    }
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  convertToCallTree: function Parser_convertToCallTree(profile, isReverse) {
    var samples = profile.samples;
    var treeRoot = new TreeNode(isReverse ? "(total)" : samples[0].frames[0], null);
    treeRoot.counter = 0;
    treeRoot.totalSamples = samples.length;
    for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      var callstack = sample.frames.clone();
      if (isReverse)
        callstack.reverse();
      else
        callstack.shift();
      var deepestExistingNode = treeRoot.followPath(callstack);
      var remainingCallstack = callstack.slice(deepestExistingNode.getDepth());
      deepestExistingNode.incrementCountersInParentChain();
      var node = deepestExistingNode;
      for (var j = 0; j < remainingCallstack.length; ++j) {
        var frame = remainingCallstack[j];
        var child = new TreeNode(frame, node);
        child.totalSamples = samples.length;
        node.children.push(child);
        node = child;
      }
    }
    return treeRoot;
  },
  _clipText: function Tree__clipText(text, length) {
    if (text.length <= length)
      return text;
    return text.substr(0, length) + "...";
  },
  mergeUnbranchedCallPaths: function Tree_mergeUnbranchedCallPaths(root) {
    var mergedNames = [root.name];
    var node = root;
    while (node.children.length == 1 && node.count == node.children[0].count) {
      node = node.children[0];
      mergedNames.push(node.name);
    }
    if (node != root) {
      // Merge path from root to node into root.
      root.children = node.children;
      root.mergedNames = mergedNames;
      //root.name = this._clipText(root.name, 50) + " to " + this._clipText(node.name, 50);
    }
    for (var i = 0; i < root.children.length; i++) {
      this.mergeUnbranchedCallPaths(root.children[i]);
    }
  },
  getFunctionInfo: function Parser_getFunctionInfo(fullName) {
    var match =
      /^(.*) \(in ([^\)]*)\) (\+ [0-9]+)$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\) (\(.*:.*\))$/.exec(fullName) ||
      /^(.*) \(in ([^\)]*)\)$/.exec(fullName) ||
      /^(.*)$/.exec(fullName);
    return {
      functionName: match[1],
      libraryName: match[2] || "",
      lineInformation: match[3] || ""
    };
  },
  discardLineLevelInformation: function Tree_discardLineLevelInformation(profile) {
    var symbols = profile.symbols;
    var data = profile.samples;
    var filteredData = [];
    for (var i = 0; i < data.length; i++) {
      filteredData.push(data[i].clone());
      var frames = filteredData[i].frames;
      for (var j = 0; j < frames.length; j++) {
        if (!(frames[j] in symbols))
          continue;
        frames[j] = symbols[frames[j]].functionIndex;
      }
    }
    return {
      symbols: symbols,
      functions: profile.functions,
      samples: filteredData
    };
  },
};
