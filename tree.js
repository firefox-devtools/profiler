function Tree(root, data) {
  this.root = root;
  this.init(data);
  this.selected = null;
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
  },
  _createTree: function Tree__createTree(root, data) {
    if (!("title" in data)) {
      return null;
    }
    var div = document.createElement("div");
    div.className = "collapsed";
    div.onclick = this._onclick;
    div.onkeypress = this._onkeypress;
    var text = document.createElement("a");
    text.innerHTML = data.title;
    text.node = div;
    div.node = div;
    div.treeText = text;
    div.treeText.className = "unselected";
    div.appendChild(text);
    div.treeChildren = [];
    div.tree = this;
    if ("children" in data) {
      for (var i = 0; i < data.children.length; ++i) {
        var innerTree = this._createTree(div, data.children[i]);
        if (innerTree) {
          div.appendChild(innerTree);
          div.treeChildren.push(innerTree);
        }
      }
    }
    return div;
  },
  _toggle: function Tree__toggle(div) {
    div.className = (div.className == "collapsed") ? "" : "collapsed";
  },
  _select: function Tree__select(div) {
    if (div.tree.selected != null) {
      div.tree.selected.treeText.className = "unselected";
      div.tree.selected = null;
    }
    if (div != null) {
      div.treeText.className = "selected";
      div.tree.selected = div;
    }
  },
  _onclick: function Tree__onclick(event) {
    Tree.prototype._toggle(event.target.node);
    Tree.prototype._select(event.target.node);
    event.stopPropagation();
  },
  _onkeypress: function Tree__onkeypress(event) {
    // handle keypresses
  },
};

