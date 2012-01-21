function Tree(root, data) {
  this.root = root;
  this.init(data);
  // root is autoselect
  // this.selected = null;
};

Tree.prototype = {
  init: function Tree_init(data) {
    while (this.root.hasChildNodes()) {
      this.root.removeChild(this.root.firstChild);
    }
    var treeRoot = document.createElement("div");
    treeRoot.className = "root";
    this.root.appendChild(treeRoot);
    var firstElem = this._createTree(treeRoot, data.data[0]);
    treeRoot.appendChild(firstElem);
    this._select(firstElem);
    this._toggle(firstElem);
  },
  _createTree: function Tree__createTree(root, data) {
    if (!("title" in data)) {
      return null;
    }
    var div = document.createElement("div");
    div.className = "collapsed";
    div.onclick = this._onclick;
    var text = document.createElement("a");
    text.innerHTML = data.title;
    text.node = div;
    div.node = div;
    div.treeText = text;
    div.treeText.className = "unselected";
    div.appendChild(text);
    div.treeChildren = [];
    div.treeParent = null;
    div.tree = this;
    if ("children" in data) {
      for (var i = 0; i < data.children.length; ++i) {
        var innerTree = this._createTree(div, data.children[i]);
        if (innerTree) {
          innerTree.treeParent = div;   
          div.appendChild(innerTree);
          div.treeChildren.push(innerTree);
        }
      }
    }
    document.onkeypress = this._onkeypress;
    return div;
  },
  _toggle: function Tree__toggle(div) {
    div.className = (div.className == "collapsed") ? "" : "collapsed";
  },
  _getParent: function Tree__getParent(div) {
    return div.treeParent;
  },
  _select: function Tree__select(div) {
    document.onkeypress = this._onkeypress;
    if (div.tree.selected != null) {
      div.tree.selected.id = "";
      div.tree.selected.treeText.className = "unselected";
      div.tree.selected = null;
    }
    if (div != null) {
      div.id = "selected_treenode";
      div.treeText.className = "selected";
      div.tree.selected = div;
    }
  },
  _selected: function Tree__selected() {
    return document.getElementById("selected_treenode");
  },
  _isCollapsed: function Tree__isCollapsed(div) {
    return (div.className == "collapsed");
  },
  _onclick: function Tree__onclick(event) {
    var target = event.target.node;
    if (target.node != null) {
      target = target.node;
    }
    Tree.prototype._toggle(target);
    Tree.prototype._select(target);
    event.stopPropagation();
  },
  _onkeypress: function Tree__onkeypress(event) {
    var selected = Tree.prototype._selected();
    if (selected == null) return;
    if (event.keyCode == 37) { // KEY_LEFT
      var isCollapsed = Tree.prototype._isCollapsed(selected);
      if (!isCollapsed) {
        Tree.prototype._toggle(selected);
      } else {
        // select parent
      }
    } else if (event.keyCode == 38) { // KEY_UP
      var parent = Tree.prototype._getParent(selected); 
      if (parent != null) {
        Tree.prototype._select(parent);
      }
    } else if (event.keyCode == 39) { // KEY_RIGHT
      var isCollapsed = Tree.prototype._isCollapsed(selected);
      if (isCollapsed) {
        Tree.prototype._toggle(selected);
      }
    } else if (event.keyCode == 40) { // KEY_DOWN
    }
    event.stopPropagation();
  },
};

