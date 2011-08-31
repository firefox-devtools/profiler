function Sample(name, extraInfo) {
  this.name = name;
  this.extraInfo = extraInfo;
}

function TreeNode(name, parent) {
  this.name = name;
  this.children = [];
  this.counter = 1;
  this.parent = parent;
  this.depth = 0;
  var node = this.parent;
  while (node) {
    this.depth++;
    node = node.parent;
  }
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
      case 'l':
        // leaf name
        extraInfo.leafName = info;
        break;
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
        if (sample) { // ignore the case where we see a 'c' before an 's'
          sample.name += "," + info;
        }
      }
    }
    return samples;
  },

  parseCallStack: function Parser_parseCallStack(serialization) {
    return serialization.split(",");
  },

  convertToCallTree: function Parser_convertToCallTree(samples) {
    var treeRoot = null;
    for (var i = 0; i < samples.length; ++i) {
      var sample = samples[i];
      var callstack = this.parseCallStack(sample.name);
      if (!treeRoot) {
        treeRoot = new TreeNode(callstack[0], null);
        var node = treeRoot;
        for (var j = 1; j < callstack.length; ++j) {
          var frame = callstack[j];
          var child = new TreeNode(frame, node);
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
          var depth = newChild.depth + 1;
          var remainingCallstack = callstack.slice(depth);
          var node = newChild;
          while (node) {
            node.counter++;
            node = node.parent;
          }
          node = newChild;
          for (var j = 0; j < remainingCallstack.length; ++j) {
            var frame = remainingCallstack[j];
            var child = new TreeNode(frame, node);
            node.children.push(child);
            node = child;
          }
        }
      }
    }
    return treeRoot;
  }
};
