Array.prototype.clone = function() { return this.slice(0); }

function makeSample(frames, extraInfo, lines) {
  return {
    frames: frames,
    extraInfo: extraInfo,
    lines: lines
  };
}

function cloneSample(sample) {
  return makeSample(sample.frames.clone(), sample.extraInfo, sample.lines.clone());
}

function TreeNode(name, parent, startCount) {
  this.name = name;
  this.children = [];
  this.counter = startCount;
  this.parent = parent;
}
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

var gParserWorker = new Worker("js/parserWorker.js");
gParserWorker.nextRequestID = 0;

var Parser = {
  parse: function Parser_parse(data, finishCallback) {
    var requestID = gParserWorker.nextRequestID++;
    gParserWorker.addEventListener("message", function onMessageFromWorker(msg) {
      if (msg.data.requestID == requestID) {
        gParserWorker.removeEventListener("message", onMessageFromWorker);
        finishCallback(msg.data.parsedProfile);
      }
    });
    gParserWorker.postMessage({
      requestID: requestID,
      task: "parseRawProfile",
      rawProfile: data
    });
  },

  filterByJank: function Parser_filterByJank(profile, filterThreshold) {
    var samples = profile.samples.clone();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      if (!sample)
        continue;
      if (!("responsiveness" in sample.extraInfo) ||
          sample.extraInfo["responsiveness"] < filterThreshold) {
        samples[i] = null;
      }
    }
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterBySymbol: function Parser_filterBySymbol(profile, symbolOrFunctionIndex) {
    console.log("filtering profile by symbol " + symbolOrFunctionIndex);
    var samples = profile.samples.map(function filterSample(origSample) {
      if (!origSample)
        return null;
      var sample = cloneSample(origSample);
      for (var i = 0; i < sample.frames.length; i++) {
        if (symbolOrFunctionIndex == sample.frames[i]) {
          sample.frames = sample.frames.slice(i);
          return sample;
        }
      }
      return null; // no frame matched; filter out complete sample
    });
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterByCallstackPrefix: function Parser_filterByCallstackPrefix(profile, callstack) {
    var samples = profile.samples.map(function filterSample(origSample, i) {
      if (!origSample)
        return null;
      if (origSample.frames.length < callstack.length)
        return null;
      var sample = cloneSample(origSample);
      for (var i = 0; i < callstack.length; i++) {
        if (sample.frames[i] != callstack[i])
          return null;
      }
      sample.frames = sample.frames.slice(callstack.length - 1);
      return sample;
    });
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterByCallstackPostfix: function Parser_filterByCallstackPostfix(profile, callstack) {
    var samples = profile.samples.map(function filterSample(origSample, i) {
      if (!origSample)
        return null;
      if (origSample.frames.length < callstack.length)
        return null;
      var sample = cloneSample(origSample);
      for (var i = 0; i < callstack.length; i++) {
        if (sample.frames[sample.frames.length - i - 1] != callstack[i])
          return null;
      }
      sample.frames = sample.frames.slice(0, sample.frames.length - callstack.length + 1);
      return sample;
    });
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  filterByName: function Parser_filterByName(profile, filterName, useFunctions) {
    function getSymbolOrFunctionName(index, profile, useFunctions) {
      if (useFunctions) {
        if (!(index in profile.functions))
          return "";
        return profile.functions[index].functionName;
      }
      if (!(index in profile.symbols))
        return "";
      return profile.symbols[index].symbolName;
    }
    console.log("filtering profile by name " + filterName);
    var samples = profile.samples.clone();
    filterName = filterName.toLowerCase();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      if (!sample)
        continue;
      var callstack = sample.frames;
      for (var j = 0; j < callstack.length; ++j) { 
        var symbolOrFunctionName = getSymbolOrFunctionName(callstack[j], profile, useFunctions);
        if (symbolOrFunctionName.toLowerCase().indexOf(filterName) != -1) {
          continue calltrace_it;
        }
      }
      samples[i] = null;
    }
    return {
      symbols: profile.symbols,
      functions: profile.functions,
      samples: samples
    };
  },

  convertToCallTree: function Parser_convertToCallTree(profile, isReverse) {
    var samples = profile.samples.filter(function noNullSamples(sample) {
      return sample != null;
    });
    if (samples.length == 0)
      return new TreeNode("(empty)", null, 0);
    var treeRoot = new TreeNode(isReverse ? "(total)" : samples[0].frames[0], null, 0);
    treeRoot.totalSamples = samples.length;
    for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      var callstack = sample.frames.clone();
      callstack.shift();
      if (isReverse)
        callstack.reverse();
      var deepestExistingNode = treeRoot.followPath(callstack);
      var remainingCallstack = callstack.slice(deepestExistingNode.getDepth());
      deepestExistingNode.incrementCountersInParentChain();
      var node = deepestExistingNode;
      for (var j = 0; j < remainingCallstack.length; ++j) {
        var frame = remainingCallstack[j];
        var child = new TreeNode(frame, node, 1);
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
  discardLineLevelInformation: function Tree_discardLineLevelInformation(profile) {
    var symbols = profile.symbols;
    var data = profile.samples;
    var filteredData = [];
    for (var i = 0; i < data.length; i++) {
      if (!data[i]) {
        filteredData.push(null);
        continue;
      }
      filteredData.push(cloneSample(data[i]));
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
