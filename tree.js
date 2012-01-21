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
    document.onkeypress = this._onkeypress;
    return div;
  },
  _toggle: function Tree__toggle(div) {
    div.className = (div.className == "collapsed") ? "" : "collapsed";
  },
  _select: function Tree__select(div) {
    document.onkeypress = this._onkeypress;
    if (div.tree.selected != null) {
      div.tree.selected.className = "";
      div.tree.selected.treeText.className = "unselected";
      div.tree.selected = null;
    }
    if (div != null) {
      div.className = "selected_treenode";
      div.treeText.className = "selected";
      div.tree.selected = div;
    }
  },
  _selected: function Tree__selected() {
    return document.getElementsByClassName("selected_treenode")[0];
  },
  _isCollapsed: function Tree__isCollapsed(div) {
    return (div.className == "collapsed");
  },
  _onclick: function Tree__onclick(event) {
    Tree.prototype._toggle(event.target.node);
    Tree.prototype._select(event.target.node);
    event.stopPropagation();
  },
  _onkeypress: function Tree__onkeypress(event) {
    var selected = Tree.prototype._selected();
    if (selected == null) return;
    if (event.keyCode == 37) {
      var isCollapsed = Tree.prototype._isCollapsed(selected);
      if (!isCollapsed) {
        Tree.prototype._toggle(selected);
      } else {
        // select parent
      }
    }
    event.stopPropagation();
  },
};

