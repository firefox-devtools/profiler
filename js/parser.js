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

function Parser() {}
Parser.prototype = {
  parse: function Parser_parse(data) {
    var lines = data.split("\n");
    var extraInfo = {};
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
          sample.frames.push(this._cleanFunctionName(info));
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
    return samples;
  },

  _cleanFunctionName: function Parser__cleanFunctionName(functionName) {
    var ignoredPrefix = "non-virtual thunk to ";
    if (functionName.substr(0, ignoredPrefix.length) == ignoredPrefix)
      return functionName.substr(ignoredPrefix.length);
    return functionName;
  },

  filterByName: function Parse_filterByName(samples, filterName) {
    samples = samples.clone(); 
    filterName = filterName.toLowerCase();
    calltrace_it: for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      var callstack = sample.frames;
      for (var j = 0; j < callstack.length; ++j) { 
        if (callstack[j].toLowerCase().indexOf(filterName) != -1) {
          continue calltrace_it;
        }
      }
      samples[i] = samples[i].clone();
      samples[i].frames = ["Filtered out"];
    }
    return samples;
  },

  convertToHeavyCallTree: function Parser_convertToHeavyCallTree(samples) {
    return Parser.prototype.convertToCallTree(samples, true);
  },

  convertToCallTree: function Parser_convertToCallTree(samples, isReverse) {
    var treeRoot = new TreeNode("(root)", null);
    treeRoot.totalSamples = samples.length;
    for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      var callstackWithoutRoot = sample.frames.slice(1);
      if (isReverse)
        callstackWithoutRoot.reverse();
      var deepestExistingNode = treeRoot.followPath(callstackWithoutRoot);
      var remainingCallstack = callstackWithoutRoot.slice(deepestExistingNode.getDepth());
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
    var node = root;
    while (node.children.length == 1 && node.count == node.children[0].count) {
      node = node.children[0];
    }
    if (node != root) {
      // Merge path from root to node into root.
      root.children = node.children;
      root.name = this._clipText(root.name, 50) + " to " + this._clipText(node.name, 50);
    }
    for (var i = 0; i < root.children.length; i++) {
      this.mergeUnbranchedCallPaths(root.children[i]);
    }
  },
  discardLineLevelInformation: function Tree_discardLineLevelInformation(data) {
    for (var i = 0; i < data.length; i++) {
      var sample = data[i];
      var frames = sample.frames;
      for (var j = 0; j < frames.length; j++) {
        var functionName = frames[j];
        var lineLevelInformationLocation = functionName.lastIndexOf(" + ");
        if (lineLevelInformationLocation != -1) {
          frames[j] = functionName.substr(0, lineLevelInformationLocation);
        } else {
          var libraryInformationLocation = functionName.lastIndexOf("(in ");
          if (libraryInformationLocation != -1) {
            var anotherBracketLocation = functionName.indexOf(") (", libraryInformationLocation + 4);
            if (anotherBracketLocation != -1) {
              frames[j] = functionName.substr(0, anotherBracketLocation + 1);
            }
          }
        }
      }
    }
  },
};
