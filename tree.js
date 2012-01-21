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
    div.onClick = data.onClick;
    div.data = data;
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
  _getFirstChild: function Tree__getFirstChild(div) {
    if (Tree.prototype._isCollapsed(div))
      return null;
    var child = div.treeChildren[0];
    return child;
  },
  _getLastChild: function Tree__getLastChild(div) {
    if (Tree.prototype._isCollapsed(div))
      return div;
    var lastChild = div.treeChildren[div.treeChildren.length-1];
    if (lastChild == null)
      return div;
    return Tree.prototype._getLastChild(lastChild);
  },
  _getPrevSib: function Tree__getPevSib(div) {
    if (div.treeParent == null)
      return null;
    var nodeIndex = div.treeParent.treeChildren.indexOf(div);
    if (nodeIndex == 0)
      return null;
    return div.treeParent.treeChildren[nodeIndex-1];
  },
  _getNextSib: function Tree__getNextSib(div) {
    if (div.treeParent == null)
      return null;
    var nodeIndex = div.treeParent.treeChildren.indexOf(div);
    if (nodeIndex == div.treeParent.treeChildren.length - 1)
      return Tree.prototype._getNextSib(div.treeParent);
    return div.treeParent.treeChildren[nodeIndex+1];
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
      if (div.onClick != null) {
        div.onClick(div.data);
      }
      //div.scrollIntoView(true);
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
    event.stopPropagation();
    event.preventDefault()
    if (selected == null) return false;
    if (event.keyCode == 37) { // KEY_LEFT
      var isCollapsed = Tree.prototype._isCollapsed(selected);
      if (!isCollapsed) {
        Tree.prototype._toggle(selected);
      } else {
        var parent = Tree.prototype._getParent(selected); 
        if (parent != null) {
          Tree.prototype._select(parent);
        }
      }
    } else if (event.keyCode == 38) { // KEY_UP
      var prevSib = Tree.prototype._getPrevSib(selected);
      var parent = Tree.prototype._getParent(selected); 
      if (prevSib != null) {
        Tree.prototype._select(Tree.prototype._getLastChild(prevSib));
      } else if (parent != null) {
        Tree.prototype._select(parent);
      }
    } else if (event.keyCode == 39) { // KEY_RIGHT
      var isCollapsed = Tree.prototype._isCollapsed(selected);
      if (isCollapsed) {
        Tree.prototype._toggle(selected);
      }
    } else if (event.keyCode == 40) { // KEY_DOWN
      var nextSib = Tree.prototype._getNextSib(selected);
      var child = Tree.prototype._getFirstChild(selected); 
      if (child != null) {
        Tree.prototype._select(child);
      } else if (nextSib) {
        Tree.prototype._select(nextSib);
      }
    }
    return false;
  },
};

