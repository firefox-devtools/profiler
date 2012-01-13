function Tree(root, data) {
  this.root = root;
  this.init(data);
};

Tree.prototype = {
  init: function Tree_init(data) {
    while (this.root.hasChildNodes()) {
      this.root.removeChild(this.root.firstChild);
    }
    var treeRoot = document.createElement("div");
    treeRoot.className = "root";
    this.root.appendChild(treeRoot);
    treeRoot.appendChild(this._createTree(treeRoot, data.data[0]));
    this._tabIndex = 0;
  },
  _createTree: function Tree__createTree(root, data) {
    if (!("title" in data)) {
      return null;
    }
    var div = document.createElement("div");
    div.className = "collapsed";
    div.onclick = this._onclick;
    div.onkeypress = this._onkeypress;
    var span = document.createElement("span");
    span.appendChild(document.createTextNode(data.title));
    span.setAttribute("tabindex", this._tabIndex++);
    div.appendChild(span);
    if ("children" in data) {
      for (var i = 0; i < data.children.length; ++i) {
        var innerTree = this._createTree(div, data.children[i]);
        if (innerTree) {
          div.appendChild(innerTree);
        }
      }
    }
    return div;
  },
  _toggle: function Tree__toggle(div) {
    div.className = (div.className == "collapsed") ? "" : "collapsed";
  },
  _onclick: function Tree__onclick(event) {
    Tree.prototype._toggle(event.target);
    event.stopPropagation();
  },
  _onkeypress: function Tree__onkeypress(event) {
    // handle keypresses
  },
};

