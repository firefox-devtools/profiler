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
TreeNode.prototype.followPath = function TreeNode_followPath(path) {
  var node = this;
nextIteration:
  for (var i = 0; i < path.length; ++i) {
    var segment = path[i];
    for (var j = 0; j < node.children.length; ++j) {
      var child = node.children[j];
      if (child.name == segment) {
        node = child;
        continue nextIteration;
      }
    }
    break;
  }
  return node;
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
          sample.frames.push(info);
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
    var treeRoot = null;
    for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      var callstack = sample.frames.clone();
      if (isReverse == true) callstack = callstack.reverse();
      if (!treeRoot) {
        treeRoot = new TreeNode(callstack[0], null);
        treeRoot.totalSamples = samples.length;
        var node = treeRoot;
        for (var j = 1; j < callstack.length; ++j) {
          if (callstack[j] == "(root)") {
            if (isReverse == true) {
              callstack[j] = "(Program start)";
            } else {
              callstack[j] = "(Top frame)";
            }
          }
          var frame = callstack[j];
          var child = new TreeNode(frame, node);
          child.totalSamples = samples.length;
          node.children.push(child);
          node = child;
        }
      } else {
        var newChild = treeRoot.followPath(callstack.slice(1));
        if (newChild.name == callstack[callstack.length - 1]) {
          // we found the exact node, so let's just increment
          // the counters through the parent chain.
          var node = newChild;
          while (node) {
            node.counter++;
            node = node.parent;
          }
        } else {
          var depth = newChild.getDepth() + 1;
          var remainingCallstack = callstack.slice(depth);
          var node = newChild;
          while (node) {
            node.counter++;
            node = node.parent;
          }
          node = newChild;
          for (var j = 0; j < remainingCallstack.length; ++j) {
            if (remainingCallstack[j] == "(root)") {
              if (isReverse == true) {
                remainingCallstack[j] = "(Program start)";
              } else {
                remainingCallstack[j] = "(Top frame)";
              }
            }
            var frame = remainingCallstack[j];
            var child = new TreeNode(frame, node);
            child.totalSamples = samples.length;
            node.children.push(child);
            node = child;
          }
        }
      }
    }
    if (treeRoot == null)
      dump("no tree root\n");
    return treeRoot;
  },
  mergeUnbranchedCallPaths: function Tree_mergeUnbranchedCallPaths(root) {
    var node = root;
    while (node.children.length == 1) {
      node = node.children[0];
      if (node.counter != root.counter) {
        console.log("different counters: " + node.counter + " vs. " + root.counter )
      }
    }
    if (node != root) {
      // Merge path from root to node into root.
      root.children = node.children;
      root.name += " ... " + node.name;
    }
    for (var i = 0; i < root.children.length; i++) {
      root.children[i] = this.mergeUnbranchedCallPaths(root.children[i]);
    }
    return root;
  },
};
